import Foundation

let baseURL = URL(string: "https://rythm.svrvs.uz")!

struct Track: Codable, Identifiable, Hashable {
    let id: String, title: String, artist: String
    let artistId: String?, albumId: String?, album: String?
    let duration: Double, sampleRate: Int, bitDepth: Int
    let promoText: String?, cover: String?, rhythm: String?
    var quality: String { "WAV · \(bitDepth)-bit · \(sampleRate / 1000) kHz" }
}
struct Album: Codable, Identifiable, Hashable { let id: String, title: String, artist: String, cover: String? }
struct Artist: Codable, Identifiable, Hashable { let id: String, name: String, image: String? }
struct NamedList: Codable, Identifiable, Hashable { let id: String, name: String }
struct Home: Codable { let promoted: [Track], fresh: [Track], popular: [Track], albums: [Album], artists: [Artist], genres: [String], editorial: [NamedList] }
struct SearchResult: Codable { let tracks: [Track], artists: [Artist], albums: [Album] }
struct Entitlement: Codable { let premium: Bool, reason: String, planName: String? }
struct User: Codable { let id: String, name: String, email: String, role: String, entitlement: Entitlement? }
struct Me: Codable { let user: User? }
struct Library: Codable { struct Item: Codable, Identifiable, Hashable { let id: String, name: String, count: Int }; let playlists: [Item], liked: [String] }
struct TrackPage: Codable { let tracks: [Track] }
struct Ad: Codable { let viewId: String, duration: Double, title: String, body: String, image: String?, audio: String?, ctaLabel: String, ctaUrl: String }
struct Grant: Codable { let url: String?, playId: String?, ad: Ad? }
struct Signup: Codable { let verify: Bool? }

struct APIError: LocalizedError { let errorDescription: String? }

enum API {
    private static let decoder = JSONDecoder()

    static func url(_ path: String?) -> URL? { path.flatMap { URL(string: $0, relativeTo: baseURL)?.absoluteURL } }

    @discardableResult
    private static func send(_ path: String, _ method: String, _ body: [String: Any]?) async throws -> Data {
        guard let target = url(path) else { throw APIError(errorDescription: "Manzil noto'g'ri") }
        var req = URLRequest(url: target)
        req.httpMethod = method
        if let body {
            req.setValue("application/json", forHTTPHeaderField: "content-type")
            req.httpBody = try JSONSerialization.data(withJSONObject: body)
        }
        let (data, response) = try await URLSession.shared.data(for: req)
        if let http = response as? HTTPURLResponse, http.statusCode >= 400 {
            let text = (try? JSONSerialization.jsonObject(with: data) as? [String: Any])?["error"] as? String
            throw APIError(errorDescription: text ?? "Xatolik (\(http.statusCode))")
        }
        return data
    }
    static func get<T: Decodable>(_ path: String) async throws -> T { try decoder.decode(T.self, from: try await send(path, "GET", nil)) }
    static func post<T: Decodable>(_ path: String, _ body: [String: Any] = [:]) async throws -> T { try decoder.decode(T.self, from: try await send(path, "POST", body)) }
    static func call(_ path: String, _ method: String = "POST", _ body: [String: Any]? = [:]) async throws { try await send(path, method, body) }
    static func search(_ q: String) async throws -> SearchResult {
        try await get("/api/search?q=\(q.addingPercentEncoding(withAllowedCharacters: .urlQueryAllowed) ?? "")")
    }
    static func segment(_ s: String) -> String { s.addingPercentEncoding(withAllowedCharacters: .urlPathAllowed.subtracting(CharacterSet(charactersIn: "/"))) ?? s }
    static func beatMap(_ path: String) async -> Data? {
        guard let target = url(path) else { return nil }
        return try? await URLSession.shared.data(from: target).0
    }
}
