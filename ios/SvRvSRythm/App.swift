import SwiftUI
import Observation

@MainActor @Observable
final class Session {
    var user: User?
    var ready = false
    var liked: Set<String> = []
    var playlists: [Library.Item] = []

    func refresh() async {
        user = (try? await API.get("/api/me") as Me)?.user
        if user != nil { await loadLibrary() }
        ready = true
    }
    func loadLibrary() async {
        guard let library: Library = try? await API.get("/api/library") else { return }
        liked = Set(library.liked)
        playlists = library.playlists
    }
    func toggleLike(_ t: Track) {
        let on = liked.contains(t.id)
        if on { liked.remove(t.id) } else { liked.insert(t.id) }
        Task {
            do { try await API.call("/api/likes/\(t.id)", on ? "DELETE" : "PUT", nil) }
            catch { if on { liked.insert(t.id) } else { liked.remove(t.id) } }
        }
    }
    func logout() async {
        try? await API.call("/api/auth/logout")
        user = nil; liked = []; playlists = []
    }
}

@main
struct RythmApp: App {
    @State private var session = Session()
    @State private var player = Player()
    var body: some Scene {
        WindowGroup {
            RootView().environment(session).environment(player).preferredColorScheme(.dark).tint(Brand.amber)
        }
    }
}

enum Brand {
    static let ember = Color(red: 1, green: 0.30, blue: 0.18)
    static let amber = Color(red: 1, green: 0.69, blue: 0.18)
    static let ink = Color(red: 0.043, green: 0.039, blue: 0.051)
}
