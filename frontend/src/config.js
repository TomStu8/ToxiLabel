// When VITE_API_URL is set (e.g. an ngrok URL), all /api and /uploads calls
// are prefixed with it. When empty, the Vite proxy handles forwarding to the
// backend container — so localhost development requires no extra configuration.
const API_BASE = import.meta.env.VITE_API_URL || ''
export default API_BASE
