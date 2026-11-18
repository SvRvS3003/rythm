import SwiftUI

struct AuthView: View {
    @Environment(Session.self) private var session
    private enum Mode { case login, signup, code }
    @State private var mode = Mode.login
    @State private var name = ""
    @State private var email = ""
    @State private var password = ""
    @State private var code = ""
    @State private var busy = false
    @State private var message: String?

    var body: some View {
        ZStack {
            Brand.ink.ignoresSafeArea()
            SoundLandscape().ignoresSafeArea()
            VStack(spacing: 14) {
                Text(mode == .code ? "Emailni tasdiqlang" : mode == .login ? "Xush kelibsiz" : "Boshlaymiz").font(.largeTitle.bold()).frame(maxWidth: .infinity, alignment: .leading)
                Group {
                    if mode == .signup { field("Ism", $name).textContentType(.name) }
                    if mode == .code { field("6 xonali kod", $code).keyboardType(.numberPad).textContentType(.oneTimeCode) }
                    else {
                        field("Email", $email).keyboardType(.emailAddress).textContentType(.emailAddress).textInputAutocapitalization(.never).autocorrectionDisabled()
                        SecureField("Parol", text: $password).textContentType(mode == .login ? .password : .newPassword).padding(14).glassEffect(.regular, in: .rect(cornerRadius: 16))
                    }
                }
                if let message { Text(message).font(.footnote).foregroundStyle(.red).frame(maxWidth: .infinity, alignment: .leading) }
                Button { Task { await submit() } } label: {
                    Text(mode == .login ? "Kirish" : mode == .signup ? "Ro'yxatdan o'tish" : "Tasdiqlash").frame(maxWidth: .infinity).padding(.vertical, 6)
                }.buttonStyle(.glassProminent).disabled(busy)
                if mode != .code {
                    Button(mode == .login ? "Akkaunt yaratish" : "Menda akkaunt bor") { message = nil; mode = mode == .login ? .signup : .login }.buttonStyle(.glass)
                }
            }.padding(24)
        }
    }
    private func field(_ title: String, _ text: Binding<String>) -> some View {
        TextField(title, text: text).padding(14).glassEffect(.regular, in: .rect(cornerRadius: 16))
    }
    private func submit() async {
        busy = true; message = nil
        defer { busy = false }
        do {
            switch mode {
            case .login: try await API.call("/api/auth/login", "POST", ["email": email, "password": password])
            case .signup:
                let result: Signup = try await API.post("/api/auth/register", ["name": name, "email": email, "password": password])
                if result.verify == true { mode = .code; return }
            case .code: try await API.call("/api/auth/verify", "POST", ["email": email, "code": code])
            }
            await session.refresh()
        } catch { message = error.localizedDescription }
    }
}

struct HomeView: View {
    @Environment(Player.self) private var player
    @State private var home: Home?
    @State private var failed: String?

    private var greeting: String {
        switch Calendar.current.component(.hour, from: .now) {
        case ..<6: "Xayrli tun"
        case ..<12: "Xayrli tong"
        case ..<18: "Xayrli kun"
        default: "Xayrli kech"
        }
    }
    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 28) {
                if let home {
                    stage(home)
                    shelf("Yangi qo'shiqlar") { ForEach(Array(home.fresh.enumerated()), id: \.element.id) { i, t in TrackCard(track: t, list: home.fresh, at: i) } }
                    if !home.popular.isEmpty {
                        let top = Array(home.popular.prefix(5))
                        VStack(alignment: .leading, spacing: 10) {
                            Text("Top 5").font(.title3.bold())
                            ForEach(Array(top.enumerated()), id: \.element.id) { i, t in TrackRow(track: t, list: top, at: i, rank: i + 1) }
                        }.padding(.horizontal)
                    }
                    if !home.albums.isEmpty { shelf("Albomlar") { ForEach(home.albums) { a in NavigationLink(value: ListRoute.album(a.id, a.title)) { tile(a.cover, a.title, a.artist) }.buttonStyle(.plain) } } }
                    if !home.artists.isEmpty { shelf("Ijrochilar") { ForEach(home.artists) { a in NavigationLink(value: ListRoute.artist(a.id, a.name)) { tile(a.image, a.name, "Ijrochi", round: true) }.buttonStyle(.plain) } } }
                    if !home.editorial.isEmpty { shelf("Tahririyat") { ForEach(home.editorial) { p in NavigationLink(value: ListRoute.playlist(p.id, p.name)) { tile(nil, p.name, "Pleylist") }.buttonStyle(.plain) } } }
                } else if let failed { ContentUnavailableView("Ochilmadi", systemImage: "wifi.slash", description: Text(failed)).padding(.top, 120) }
                else { ProgressView().frame(maxWidth: .infinity).padding(.top, 200) }
            }.padding(.bottom, 24)
        }
        .background(Brand.ink)
        .ignoresSafeArea(edges: .top)
        .scrollEdgeEffectStyle(.soft, for: .top)
        .navigationDestination(for: ListRoute.self) { ListScreen(route: $0) }
        .refreshable { await load() }
        .task { if home == nil { await load() } }
    }
    private func load() async {
        do { home = try await API.get("/api/home"); failed = nil } catch { failed = error.localizedDescription }
    }
    private func stage(_ home: Home) -> some View {
        let lead = home.promoted.first ?? home.fresh.first
        let list = home.promoted.isEmpty ? home.fresh : home.promoted
        return ZStack(alignment: .bottomLeading) {
            SoundLandscape().frame(height: 520)
            LinearGradient(colors: [.clear, Brand.ink], startPoint: .center, endPoint: .bottom).allowsHitTesting(false)
            VStack(alignment: .leading, spacing: 10) {
                Text(greeting).font(.subheadline.weight(.semibold)).foregroundStyle(.secondary)
                if let lead {
                    Text(home.promoted.isEmpty ? "YANGI CHIQDI" : "REKLAMA").font(.caption2.weight(.heavy)).kerning(2).foregroundStyle(Brand.amber)
                    Text(lead.title).font(.system(size: 46, weight: .heavy)).tracking(-1.5).lineLimit(2).minimumScaleFactor(0.6)
                    Text(lead.promoText?.isEmpty == false ? lead.promoText! : lead.artist).foregroundStyle(.secondary).lineLimit(1)
                    HStack(spacing: 12) {
                        Button { player.play(list) } label: { Label("Tinglash", systemImage: "play.fill").padding(.horizontal, 6).padding(.vertical, 4) }.buttonStyle(.glassProminent)
                        Text(lead.quality).font(.caption).monospacedDigit().foregroundStyle(.secondary)
                    }.padding(.top, 6)
                }
            }.padding(.horizontal).padding(.bottom, 8)
        }.frame(height: 520)
    }
    private func shelf<Content: View>(_ title: String, @ViewBuilder content: () -> Content) -> some View {
        VStack(alignment: .leading, spacing: 10) {
            Text(title).font(.title3.bold()).padding(.horizontal)
            ScrollView(.horizontal, showsIndicators: false) { LazyHStack(alignment: .top, spacing: 14) { content() }.padding(.horizontal) }
        }
    }
    private func tile(_ image: String?, _ title: String, _ sub: String, round: Bool = false) -> some View {
        VStack(alignment: round ? .center : .leading, spacing: 6) {
            Cover(path: image, label: title).frame(width: 150, height: 150).clipShape(.rect(cornerRadius: round ? 75 : 12))
            Text(title).font(.subheadline.weight(.semibold)).lineLimit(1)
            Text(sub).font(.caption).foregroundStyle(.secondary).lineLimit(1)
        }.frame(width: 150, alignment: round ? .center : .leading)
    }
}

enum ListRoute: Hashable {
    case album(String, String), artist(String, String), playlist(String, String), liked
    var title: String {
        switch self { case .album(_, let t), .artist(_, let t), .playlist(_, let t): t; case .liked: "Yoqtirilganlar" }
    }
    var path: String {
        switch self {
        case .album(let id, _): "/api/albums/\(id)"
        case .artist(let id, _): "/api/artists/\(id)"
        case .playlist(let id, _): "/api/playlists/\(id)"
        case .liked: "/api/likes"
        }
    }
}

struct ListScreen: View {
    @Environment(Player.self) private var player
    let route: ListRoute
    @State private var tracks: [Track]?
    @State private var failed: String?
    var body: some View {
        List {
            if let tracks {
                if tracks.isEmpty { ContentUnavailableView("Hali qo'shiq yo'q", systemImage: "music.note") }
                ForEach(Array(tracks.enumerated()), id: \.element.id) { i, t in TrackRow(track: t, list: tracks, at: i) }.listRowBackground(Color.clear)
            } else if let failed { Text(failed).foregroundStyle(.secondary) } else { ProgressView() }
        }
        .listStyle(.plain).scrollContentBackground(.hidden).background(Brand.ink)
        .navigationTitle(route.title)
        .toolbar {
            if let tracks, !tracks.isEmpty {
                ToolbarItem(placement: .primaryAction) { Button { player.play(tracks) } label: { Image(systemName: "play.fill") }.accessibilityLabel("Tinglash") }
            }
        }
        .task { do { tracks = (try await API.get(route.path) as TrackPage).tracks } catch { failed = error.localizedDescription } }
    }
}

struct SearchView: View {
    @State private var query = ""
    @State private var result: SearchResult?
    @State private var all: [Track] = []
    var body: some View {
        let shown = query.isEmpty ? all : (result?.tracks ?? [])
        List {
            ForEach(Array(shown.enumerated()), id: \.element.id) { i, t in TrackRow(track: t, list: shown, at: i) }.listRowBackground(Color.clear)
            if !query.isEmpty, let result {
                ForEach(result.artists) { a in NavigationLink(value: ListRoute.artist(a.id, a.name)) { Label(a.name, systemImage: "person.fill") } }.listRowBackground(Color.clear)
                ForEach(result.albums) { a in NavigationLink(value: ListRoute.album(a.id, a.title)) { Label(a.title, systemImage: "square.stack.fill") } }.listRowBackground(Color.clear)
            }
        }
        .listStyle(.plain).scrollContentBackground(.hidden).background(Brand.ink)
        .navigationTitle("Qidiruv")
        .navigationDestination(for: ListRoute.self) { ListScreen(route: $0) }
        .searchable(text: $query, prompt: "Qo'shiq, ijrochi yoki albom")
        .task { all = (try? await API.get("/api/catalog") as TrackPage)?.tracks ?? [] }
        .task(id: query) {
            guard !query.isEmpty else { result = nil; return }
            try? await Task.sleep(for: .milliseconds(250))
            guard !Task.isCancelled else { return }
            result = try? await API.search(query)
        }
    }
}

struct LibraryView: View {
    @Environment(Session.self) private var session
    @State private var naming = false
    @State private var name = ""
    var body: some View {
        List {
            NavigationLink(value: ListRoute.liked) { Label("Yoqtirilganlar", systemImage: "heart.fill") }.listRowBackground(Color.clear)
            ForEach(session.playlists) { p in
                NavigationLink(value: ListRoute.playlist(p.id, p.name)) { Label("\(p.name) · \(p.count)", systemImage: "music.note.list") }.listRowBackground(Color.clear)
            }
        }
        .listStyle(.plain).scrollContentBackground(.hidden).background(Brand.ink)
        .navigationTitle("Kutubxona")
        .navigationDestination(for: ListRoute.self) { ListScreen(route: $0) }
        .toolbar { ToolbarItem(placement: .primaryAction) { Button { naming = true } label: { Image(systemName: "plus") }.accessibilityLabel("Yangi pleylist") } }
        .alert("Yangi pleylist", isPresented: $naming) {
            TextField("Nomi", text: $name)
            Button("Yaratish") { let n = name; name = ""; Task { try? await API.call("/api/playlists", "POST", ["name": n]); await session.loadLibrary() } }
            Button("Bekor qilish", role: .cancel) {}
        }
        .task { await session.loadLibrary() }
    }
}

struct AccountView: View {
    @Environment(Session.self) private var session
    @Environment(Player.self) private var player
    private var planLabel: String {
        guard let e = session.user?.entitlement else { return "" }
        switch e.reason {
        case "admin": return e.planName.map { "\($0) · doimiy" } ?? "Admin"
        case "plans_off": return "Bepul rejim"
        case "exempt": return "Maxsus ruxsat"
        case "plan": return "Faol tarif"
        case "family": return "Oila tarifi"
        default: return "Sado (bepul)"
        }
    }
    private var version: String { Bundle.main.object(forInfoDictionaryKey: "CFBundleShortVersionString") as? String ?? "" }
    var body: some View {
        List {
            Section {
                LabeledContent("Ism", value: session.user?.name ?? "")
                LabeledContent("Email", value: session.user?.email ?? "")
                LabeledContent("Tarif", value: planLabel)
                LabeledContent("Ilova", value: version)
            }
            Section {
                if session.user?.role != "admin", let plans = API.url("/premium") { Link("Tariflar", destination: plans) }
                if session.user?.role == "admin", let admin = API.url("/admin") { Link("Admin panel", destination: admin) }
                Button("Chiqish", role: .destructive) { player.logout(); Task { await session.logout() } }
            }
        }
        .navigationTitle("Akkaunt")
    }
}
