import SwiftUI

struct NowPlayingView: View {
    @Environment(Player.self) private var player
    @Environment(Session.self) private var session
    @Environment(\.dismiss) private var dismiss
    @State private var scrub: Double?
    @State private var showQueue = false

    var body: some View {
        let t = player.track
        ZStack {
            Brand.ink.ignoresSafeArea()
            backdrop(t).ignoresSafeArea()
            SoundLandscape().ignoresSafeArea()
            VStack(spacing: 18) {
                HStack {
                    Button { dismiss() } label: { Image(systemName: "chevron.down").padding(6) }.buttonStyle(.glass).accessibilityLabel("Yopish")
                    Spacer()
                    Text(t?.album ?? "SvRvS Rythm").font(.footnote.weight(.semibold)).foregroundStyle(.secondary).lineLimit(1)
                    Spacer()
                    Button { showQueue = true } label: { Image(systemName: "list.bullet").padding(6) }.buttonStyle(.glass).accessibilityLabel("Navbat")
                }
                Spacer(minLength: 0)
                art(t)
                Spacer(minLength: 0)
                info(t)
                seekBar
                controls
            }
            .padding(.horizontal, 22).padding(.vertical, 10)
        }
        .sheet(isPresented: $showQueue) { QueueSheet().presentationDetents([.medium, .large]) }
    }

    private func backdrop(_ t: Track?) -> some View {
        Cover(path: t?.cover, label: t?.title ?? "").blur(radius: 70).opacity(0.45).scaleEffect(1.4).accessibilityHidden(true)
    }
    private func art(_ t: Track?) -> some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: !player.isPlaying)) { timeline in
            let clock = timeline.date.timeIntervalSinceReferenceDate
            let bands = player.bandsNow()
            let hit = Double(bands?.prefix(4).reduce(0, +) ?? 0) / 4
            let moving = bands == nil ? 0.0 : 1.0

            Cover(path: t?.cover, label: t?.title ?? "")
                .aspectRatio(1, contentMode: .fit)
                .clipShape(.rect(cornerRadius: 24))
                .glassEffect(.clear, in: .rect(cornerRadius: 24))
                .shadow(color: .black.opacity(0.5), radius: 30, y: 20)
                .scaleEffect(1 + hit * 0.035)
                .rotation3DEffect(.degrees(sin(clock * 0.53) * 5 * moving - hit * 3), axis: (x: 1, y: 0, z: 0), perspective: 0.45)
                .rotation3DEffect(.degrees(sin(clock * 0.37) * 8 * moving), axis: (x: 0, y: 1, z: 0), perspective: 0.45)
        }
        .frame(maxWidth: 380)
    }
    private func info(_ t: Track?) -> some View {
        HStack {
            VStack(alignment: .leading, spacing: 3) {
                Text(t?.title ?? "").font(.title2.bold()).lineLimit(1)
                Text(t?.artist ?? "").foregroundStyle(.secondary).lineLimit(1)
                if let q = t?.quality { Text(q).font(.caption2.weight(.semibold)).foregroundStyle(Brand.amber).padding(.top, 2) }
            }
            Spacer()
            if let t {
                Button { session.toggleLike(t) } label: { Image(systemName: session.liked.contains(t.id) ? "heart.fill" : "heart").padding(6) }
                    .buttonStyle(.glass).accessibilityLabel("Yoqtirish")
            }
        }
    }
    private var seekBar: some View {
        VStack(spacing: 4) {
            Slider(value: Binding(get: { scrub ?? player.position }, set: { scrub = $0 }), in: 0...max(player.duration, 1)) { editing in
                if !editing, let scrub { player.seek(scrub); self.scrub = nil }
            }
            .accessibilityLabel("Qo'shiq vaqti")
            HStack { Text(clock(scrub ?? player.position)); Spacer(); Text(clock(player.duration)) }.font(.caption).monospacedDigit().foregroundStyle(.secondary)
        }
    }
    private var controls: some View {
        @Bindable var player = player
        return GlassEffectContainer(spacing: 18) {
            HStack(spacing: 18) {
                Button { player.shuffle.toggle() } label: { Image(systemName: "shuffle").frame(width: 28, height: 28).foregroundStyle(player.shuffle ? Brand.amber : .primary) }
                    .buttonStyle(.glass).accessibilityLabel("Aralashtirish")
                Button { player.previous() } label: { Image(systemName: "backward.fill").frame(width: 34, height: 34) }.buttonStyle(.glass).accessibilityLabel("Oldingi")
                Button { player.toggle() } label: { Image(systemName: player.isPlaying ? "pause.fill" : "play.fill").font(.title).frame(width: 56, height: 56) }
                    .buttonStyle(.glassProminent).accessibilityLabel(player.isPlaying ? "Pauza" : "Ijro")
                Button { player.next() } label: { Image(systemName: "forward.fill").frame(width: 34, height: 34) }.buttonStyle(.glass).accessibilityLabel("Keyingi")
                Button { player.repeatMode = player.repeatMode == .all ? .one : player.repeatMode == .one ? .off : .all } label: {
                    Image(systemName: player.repeatMode == .one ? "repeat.1" : "repeat").frame(width: 28, height: 28).foregroundStyle(player.repeatMode == .off ? Color.primary : Brand.amber)
                }.buttonStyle(.glass).accessibilityLabel("Takrorlash")
            }
        }
    }
    private func clock(_ s: Double) -> String { let v = Int(max(0, s.isFinite ? s : 0)); return String(format: "%d:%02d", v / 60, v % 60) }
}

struct QueueSheet: View {
    @Environment(Player.self) private var player
    var body: some View {
        NavigationStack {
            List(Array(player.queue.enumerated()), id: \.offset) { i, t in
                Button { player.choose(i) } label: {
                    HStack(spacing: 12) {
                        Cover(path: t.cover, label: t.title).frame(width: 44, height: 44).clipShape(.rect(cornerRadius: 8))
                        VStack(alignment: .leading) { Text(t.title).lineLimit(1).foregroundStyle(i == player.index ? Brand.amber : .primary); Text(t.artist).font(.footnote).foregroundStyle(.secondary).lineLimit(1) }
                    }
                }.buttonStyle(.plain)
            }.navigationTitle("Navbat")
        }
    }
}
