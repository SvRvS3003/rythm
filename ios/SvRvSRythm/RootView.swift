import SwiftUI

struct RootView: View {
    @Environment(Session.self) private var session
    @Environment(Player.self) private var player
    @State private var showNow = false

    var body: some View {
        @Bindable var player = player
        Group {
            if !session.ready { ProgressView().frame(maxWidth: .infinity, maxHeight: .infinity).background(Brand.ink) }
            else if session.user == nil { AuthView() }
            else { tabs }
        }
        .task { await session.refresh() }
        .fullScreenCover(isPresented: $showNow) { NowPlayingView() }
        .sheet(item: $player.ad) { ad in AdView(ad: ad).interactiveDismissDisabled() }
        .alert("Xatolik", isPresented: Binding(get: { player.error != nil }, set: { if !$0 { player.error = nil } })) {
            Button("Yopish", role: .cancel) {}
        } message: { Text(player.error ?? "") }
    }

    private var tabs: some View {
        TabView {
            Tab("Bosh sahifa", systemImage: "house.fill") { NavigationStack { HomeView() } }
            Tab("Kutubxona", systemImage: "books.vertical.fill") { NavigationStack { LibraryView() } }
            Tab("Akkaunt", systemImage: "person.fill") { NavigationStack { AccountView() } }
            Tab("Qidiruv", systemImage: "magnifyingglass", role: .search) { NavigationStack { SearchView() } }
        }
        .tabBarMinimizeBehavior(.onScrollDown)
        .modifier(MiniPlayerAccessory(open: { showNow = true }))
    }
}

private struct MiniPlayerAccessory: ViewModifier {
    @Environment(Player.self) private var player
    let open: () -> Void
    func body(content: Content) -> some View {
        if player.track != nil {
            content.tabViewBottomAccessory { MiniPlayer(open: open) }
        } else { content }
    }
}

struct MiniPlayer: View {
    @Environment(Player.self) private var player
    let open: () -> Void
    var body: some View {
        HStack(spacing: 12) {
            Button(action: open) {
                HStack(spacing: 10) {
                    Cover(path: player.track?.cover, label: player.track?.title ?? "").frame(width: 30, height: 30).clipShape(.rect(cornerRadius: 7))
                    Text(player.track?.title ?? "").font(.subheadline.weight(.semibold)).lineLimit(1)
                    Spacer(minLength: 0)
                }.contentShape(.rect)
            }.buttonStyle(.plain)
            Button { player.toggle() } label: { Image(systemName: player.isPlaying ? "pause.fill" : "play.fill") }
                .accessibilityLabel(player.isPlaying ? "Pauza" : "Ijro")
            Button { player.next() } label: { Image(systemName: "forward.fill") }.accessibilityLabel("Keyingi")
        }
        .padding(.horizontal, 14)
        .tint(.primary)
    }
}

struct AdView: View {
    @Environment(Player.self) private var player
    let ad: Ad
    @State private var left = 0.0
    var body: some View {
        VStack(spacing: 18) {
            Text("Reklama").font(.caption.weight(.bold)).textCase(.uppercase).foregroundStyle(Brand.amber)
            if let address = API.url(ad.image) { AsyncImage(url: address) { $0.resizable().scaledToFit() } placeholder: { Color.clear }.frame(maxHeight: 220).clipShape(.rect(cornerRadius: 16)) }
            Text(ad.title).font(.title2.bold()).multilineTextAlignment(.center)
            Text(ad.body).foregroundStyle(.secondary).multilineTextAlignment(.center)
            if let link = URL(string: ad.ctaUrl), !ad.ctaLabel.isEmpty { Link(ad.ctaLabel, destination: link).buttonStyle(.glass) }
            Text(left > 0 ? "\(Int(left.rounded(.up))) soniya" : "Davom etmoqda…").monospacedDigit().foregroundStyle(.secondary)
        }
        .padding(28)
        .task {
            left = ad.duration
            while left > 0 { try? await Task.sleep(for: .seconds(1)); left -= 1 }
            player.finishAd()
        }
    }
}
extension Ad: Identifiable { var id: String { viewId } }
