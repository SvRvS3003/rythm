import SwiftUI

struct Cover: View {
    let path: String?
    let label: String
    var body: some View {
        if let address = API.url(path) {
            AsyncImage(url: address) { $0.resizable().scaledToFill() } placeholder: { Waveform(label: label) }
        } else { Waveform(label: label) }
    }
}

struct Waveform: View {
    let label: String
    private var seed: UInt32 { label.unicodeScalars.reduce(5381) { ($0 &* 33) &+ $1.value } }
    var body: some View {
        let hue = Double(seed % 360) / 360
        Canvas { context, size in
            for i in 0..<17 {
                let swell = sin(Double(i + 1) / 18 * .pi)
                let height = (0.08 + swell * (0.18 + Double((seed >> UInt32(i % 24)) & 31) * 0.016)) * size.height
                let x = (0.13 + Double(i) * 0.044) * size.width
                let bar = CGRect(x: x, y: (size.height - height) / 2, width: size.width * 0.019, height: height)
                context.fill(Path(roundedRect: bar, cornerRadius: bar.width / 2), with: .color(Color(hue: hue, saturation: 0.55, brightness: 0.85)))
            }
        }
        .background(LinearGradient(colors: [Color(hue: hue, saturation: 0.35, brightness: 0.2), Color(hue: hue, saturation: 0.3, brightness: 0.07)], startPoint: .topLeading, endPoint: .bottomTrailing))
        .accessibilityHidden(true)
    }
}

struct TrackRow: View {
    @Environment(Session.self) private var session
    @Environment(Player.self) private var player
    let track: Track
    let list: [Track]
    let at: Int
    var rank: Int?
    var body: some View {
        HStack(spacing: 12) {
            Button { player.play(list, from: at) } label: {
                HStack(spacing: 12) {
                    if let rank { Text("\(rank)").font(.subheadline.weight(.semibold)).monospacedDigit().foregroundStyle(.secondary).frame(width: 20) }
                    Cover(path: track.cover, label: track.title).frame(width: 48, height: 48).clipShape(.rect(cornerRadius: 8))
                    VStack(alignment: .leading, spacing: 2) {
                        Text(track.title).font(.body.weight(.semibold)).lineLimit(1).foregroundStyle(player.track?.id == track.id ? Brand.amber : .primary)
                        Text(track.artist).font(.footnote).foregroundStyle(.secondary).lineLimit(1)
                    }
                    Spacer(minLength: 0)
                }.contentShape(.rect)
            }.buttonStyle(.plain)
            Button { session.toggleLike(track) } label: { Image(systemName: session.liked.contains(track.id) ? "heart.fill" : "heart") }
                .buttonStyle(.plain).foregroundStyle(session.liked.contains(track.id) ? Brand.ember : .secondary)
                .accessibilityLabel("Yoqtirish")
        }
    }
}

struct TrackCard: View {
    @Environment(Player.self) private var player
    let track: Track, list: [Track], at: Int
    var body: some View {
        Button { player.play(list, from: at) } label: {
            VStack(alignment: .leading, spacing: 6) {
                Cover(path: track.cover, label: track.title).frame(width: 150, height: 150).clipShape(.rect(cornerRadius: 12))
                Text(track.title).font(.subheadline.weight(.semibold)).lineLimit(1)
                Text(track.artist).font(.caption).foregroundStyle(.secondary).lineLimit(1)
            }.frame(width: 150, alignment: .leading)
        }.buttonStyle(.plain)
    }
}

struct SoundLandscape: View {
    @Environment(Player.self) private var player
    var low = Brand.ember, high = Brand.amber
    @State private var field = SoundField()
    var body: some View {
        TimelineView(.animation(minimumInterval: 1.0 / 30, paused: !player.isPlaying)) { timeline in
            Canvas { context, size in
                field.advance(to: timeline.date.timeIntervalSinceReferenceDate, bands: player.bandsNow())
                field.draw(&context, size: size, low: low, high: high)
            }
        }
        .accessibilityHidden(true)
        .allowsHitTesting(false)
    }
}

final class SoundField {
    private static let cols = 48, rows = 30
    private var ridges: [[Float]]
    private var phase = 0.0, last = 0.0
    private var clock = 0.0

    init() {

        ridges = (0..<Self.rows).map { r in (0..<Self.cols).map { c in
            let x = Float(c) / Float(Self.cols - 1) * 2 - 1
            return exp(-x * x * 3) * (0.22 + 0.2 * sin(Float(r) * 0.31 + x * 2.1) * sin(Float(r) * 0.13 - x * 3.7) + 0.1 * sin(Float(r) * 0.71 + x * 9))
        } }
    }
    func advance(to now: Double, bands: [Float]?) {
        let dt = min(0.1, last == 0 ? 0 : now - last)
        last = now
        guard let bands else { return }
        clock += dt

        var row = (0..<Self.cols).map { c -> Float in
            let m = abs(Float(c) / Float(Self.cols - 1) * 2 - 1)
            let at = m * Float(bands.count - 1), i = Int(at), f = at - Float(i)
            return bands[i] * (1 - f) + bands[min(i + 1, bands.count - 1)] * f
        }
        for c in 0..<Self.cols { row[c] = ridges[0][c] + (row[c] - ridges[0][c]) * 0.45 }
        ridges[0] = row
        phase += dt * 11
        while phase >= 1 { phase -= 1; ridges.insert(row, at: 0); ridges.removeLast() }
    }
    func draw(_ context: inout GraphicsContext, size: CGSize, low: Color, high: Color) {
        let yaw = sin(clock * 0.11) * 0.24, c = cos(yaw), s = sin(yaw)
        context.blendMode = .plusLighter
        for r in stride(from: Self.rows - 1, through: 0, by: -1) {
            let t = (Double(r) + phase) / Double(Self.rows)
            let fog = min(1, (1 - t) * 2) * min(1, t * 20)
            guard fog > 0.01 else { continue }
            var path = Path(), peak: Float = 0
            for col in 0..<Self.cols {
                let x = Double(col) / Double(Self.cols - 1) * 2 - 1
                let h = ridges[r][col]
                peak = max(peak, h)
                let wx = x * 1.9, wz = t * 3.4 + 0.42 - 1.8
                let rx = wx * c - wz * s, rz = wz * c + wx * s + 1.8
                let f = 1.35 / max(rz, 0.08)
                let px = size.width / 2 + rx * f * size.width * 0.5
                let py = size.height * 0.36 - (-0.62 + Double(h) * 0.78) * f * size.height * 0.5
                if col == 0 { path.move(to: CGPoint(x: px, y: py)) } else { path.addLine(to: CGPoint(x: px, y: py)) }
            }
            let color = peak > 0.55 ? high : low
            context.stroke(path, with: .color(color.opacity(fog * (0.3 + 0.7 * Double(min(1, peak * 1.6))))), lineWidth: r < 6 ? 1.2 : 0.8)
        }
    }
}
