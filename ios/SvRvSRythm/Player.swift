import AVFoundation
import MediaPlayer
import UIKit
import Observation

enum Repeat: String { case off, all, one }

@MainActor @Observable
final class Player {
    private(set) var queue: [Track] = []
    private(set) var index = -1
    private(set) var isPlaying = false
    private(set) var position: Double = 0
    private(set) var duration: Double = 0
    private(set) var beat: Data?
    var shuffle = false
    var repeatMode: Repeat = .all
    var ad: Ad?
    var error: String?
    var track: Track? { queue.indices.contains(index) ? queue[index] : nil }

    private let engine = AVQueuePlayer()
    private var adPlayer: AVPlayer?
    private var timeObserver: Any?
    private var observers: [NSKeyValueObservation] = []
    private var pending: (index: Int, item: AVPlayerItem, playId: String?)?
    private var preparing = false
    private var token = 0
    private var playId: String?
    @ObservationIgnored private var heard = 0.0
    @ObservationIgnored private var lastTick = 0.0
    @ObservationIgnored private var counted = false
    private var art: MPMediaItemArtwork?
    private var pendingAfterAd: Int?
    private let beatFPS = 20.0, beatBands = 16

    init() {
        try? AVAudioSession.sharedInstance().setCategory(.playback, mode: .default)
        engine.automaticallyWaitsToMinimizeStalling = true
        timeObserver = engine.addPeriodicTimeObserver(forInterval: CMTime(value: 1, timescale: 4), queue: .main) { [weak self] time in
            MainActor.assumeIsolated { self?.tick(time.seconds) }
        }
        observers.append(engine.observe(\.currentItem) { [weak self] _, _ in
            DispatchQueue.main.async { MainActor.assumeIsolated { self?.itemChanged() } }
        })
        observers.append(engine.observe(\.timeControlStatus) { [weak self] player, _ in
            let on = player.timeControlStatus != .paused
            DispatchQueue.main.async { MainActor.assumeIsolated { self?.isPlaying = on; self?.publish() } }
        })
        NotificationCenter.default.addObserver(forName: AVAudioSession.interruptionNotification, object: nil, queue: .main) { [weak self] note in
            let raw = note.userInfo?[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
            let ended = (note.userInfo?[AVAudioSessionInterruptionTypeKey] as? UInt) == AVAudioSession.InterruptionType.ended.rawValue
            MainActor.assumeIsolated { if ended, AVAudioSession.InterruptionOptions(rawValue: raw).contains(.shouldResume) { self?.resume() } }
        }
        let center = MPRemoteCommandCenter.shared()
        center.playCommand.addTarget { [weak self] _ in MainActor.assumeIsolated { self?.resume() }; return .success }
        center.pauseCommand.addTarget { [weak self] _ in MainActor.assumeIsolated { self?.pause() }; return .success }
        center.togglePlayPauseCommand.addTarget { [weak self] _ in MainActor.assumeIsolated { self?.toggle() }; return .success }
        center.nextTrackCommand.addTarget { [weak self] _ in MainActor.assumeIsolated { self?.next() }; return .success }
        center.previousTrackCommand.addTarget { [weak self] _ in MainActor.assumeIsolated { self?.previous() }; return .success }
        center.changePlaybackPositionCommand.addTarget { [weak self] event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            MainActor.assumeIsolated { self?.seek(event.positionTime) }
            return .success
        }
    }

    func play(_ list: [Track], from start: Int = 0) {
        guard list.indices.contains(start) else { return }
        queue = list
        load(start)
    }

    private func load(_ target: Int) {
        guard queue.indices.contains(target) else { return }
        token += 1
        let mine = token
        index = target
        position = 0
        duration = queue[target].duration
        art = nil
        resetListening(nil)
        pending = nil
        engine.pause()
        publish()
        loadExtras(for: queue[target])
        Task {
            do {
                guard let grant = try await request(queue[target]) else { return }
                guard mine == token else { return }
                if let ad = grant.ad { pendingAfterAd = target; startAd(ad); return }
                guard let address = API.url(grant.url) else { throw APIError(errorDescription: "Havola topilmadi") }
                start(AVPlayerItem(url: address), playId: grant.playId)
            } catch { if mine == token { self.error = error.localizedDescription } }
        }
    }
    private func start(_ item: AVPlayerItem, playId id: String?) {
        try? AVAudioSession.sharedInstance().setActive(true)
        engine.removeAllItems()
        engine.insert(item, after: nil)
        resetListening(id)
        engine.play()
    }
    private func request(_ t: Track) async throws -> Grant? {
        try await API.post("/api/play", ["trackId": t.id, "hidden": UIApplication.shared.applicationState != .active])
    }
    private func resetListening(_ id: String?) { playId = id; heard = 0; counted = false; lastTick = 0 }

    func pause() { engine.pause(); publish() }
    func resume() {
        if ad != nil { return }
        try? AVAudioSession.sharedInstance().setActive(true)
        if engine.currentItem == nil, index >= 0 { load(index) } else { engine.play() }
    }
    func toggle() { engine.timeControlStatus == .paused ? resume() : pause() }
    func next() {
        if let pending, pending.index == upcoming() { engine.advanceToNextItem(); return }
        load(upcoming())
    }
    func previous() { if position > 4 { seek(0) } else { load(max(0, index - 1)) } }
    func seek(_ seconds: Double) {
        position = seconds
        engine.seek(to: CMTime(seconds: seconds, preferredTimescale: 600), toleranceBefore: .zero, toleranceAfter: .zero)
        lastTick = seconds
        publish()
    }
    func choose(_ target: Int) { load(target) }

    private var shuffled: Int?
    private func upcoming() -> Int {
        if shuffle, queue.count > 1 {
            if let shuffled { return shuffled }
            var pick: Int
            repeat { pick = Int.random(in: 0..<queue.count) } while pick == index
            shuffled = pick
            return pick
        }
        return index + 1 < queue.count ? index + 1 : 0
    }

    private func tick(_ now: Double) {
        guard now.isFinite else { return }
        position = now
        if let known = engine.currentItem?.duration.seconds, known.isFinite, known > 0 { duration = known }
        let delta = now - lastTick
        lastTick = now
        if delta > 0, delta < 2 { heard += delta }
        if !counted, let playId, heard >= min(30, duration / 2) {
            counted = true
            Task { do { try await API.call("/api/plays/\(playId)/counted") } catch { counted = false } }
        }
        if repeatMode == .one, duration > 0, duration - now < 0.3 { seek(0); return }

        if duration - now < 30, pending == nil, !preparing, repeatMode == .all || (repeatMode == .off && shuffle) { prepareNext() }
        if repeatMode == .off, !shuffle, duration > 0, duration - now < 0.2 { pause() }
    }
    private func prepareNext() {
        preparing = true
        let target = upcoming(), mine = token
        Task {
            defer { preparing = false }
            guard let grant = try? await request(queue[target]), mine == token, grant.ad == nil, let address = API.url(grant.url) else { return }
            let item = AVPlayerItem(url: address)
            engine.insert(item, after: engine.currentItem)
            pending = (target, item, grant.playId)
        }
    }
    private func itemChanged() {
        guard let pending, engine.currentItem === pending.item else {
            if engine.currentItem == nil, track != nil, self.pending == nil, ad == nil, repeatMode != .off, duration > 0, duration - position < 2 { load(upcoming()) }
            return
        }
        index = pending.index
        shuffled = nil
        resetListening(pending.playId)
        self.pending = nil
        position = 0
        art = nil
        if let t = track { duration = t.duration; loadExtras(for: t) }
        publish()
    }

    private func startAd(_ ad: Ad) {
        self.ad = ad
        if let sound = API.url(ad.audio) { adPlayer = AVPlayer(url: sound); adPlayer?.play() }
    }
    func finishAd() {
        guard let ad else { return }
        adPlayer?.pause(); adPlayer = nil
        self.ad = nil
        let target = pendingAfterAd
        pendingAfterAd = nil
        Task {
            try? await API.call("/api/ads/\(ad.viewId)/complete")
            if let target { load(target) }
        }
    }

    func logout() { engine.removeAllItems(); queue = []; index = -1; beat = nil; publish() }

    func bandsNow() -> [Float]? {
        guard isPlaying, let beat else { return nil }
        let start = Int(position * beatFPS) * beatBands
        guard start >= 0, start + beatBands <= beat.count else { return nil }
        return (0..<beatBands).map { Float(beat[start + $0]) / 255 }
    }

    private func loadExtras(for t: Track) {
        beat = nil
        Task {
            if let path = t.rhythm, let data = await API.beatMap(path), track?.id == t.id { beat = data }
            if let address = API.url(t.cover), let (data, _) = try? await URLSession.shared.data(from: address), let image = UIImage(data: data), track?.id == t.id {
                art = MPMediaItemArtwork(boundsSize: image.size) { _ in image }
                publish()
            }
        }
    }
    private func publish() {
        let screen = MPNowPlayingInfoCenter.default()
        guard let t = track else { screen.nowPlayingInfo = nil; return }
        var info: [String: Any] = [
            MPMediaItemPropertyTitle: t.title, MPMediaItemPropertyArtist: t.artist,
            MPMediaItemPropertyPlaybackDuration: duration, MPNowPlayingInfoPropertyElapsedPlaybackTime: position,
            MPNowPlayingInfoPropertyPlaybackRate: engine.timeControlStatus == .paused ? 0.0 : 1.0,
        ]
        if let album = t.album { info[MPMediaItemPropertyAlbumTitle] = album }
        if let art { info[MPMediaItemPropertyArtwork] = art }
        screen.nowPlayingInfo = info
    }
}
