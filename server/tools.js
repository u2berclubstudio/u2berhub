// The tool catalog the hub renders. Add a tool here + a route in the client.
// optIn: true  =>  NOT part of the default-everything grant. It stays hidden until
// an admin turns its pill on for that user (admins always see it). Use this for
// tools that are personal or still being shaped.
export const TOOLS = [
  { id: "savedreels", name: "SAVEDREELS", tagline: "Every reel you saved, finally working for you.", status: "live" },
  { id: "contentflow", name: "CONTENTFLOW", tagline: "Inspiration \u2192 Idea \u2192 Script \u2192 Shoot \u2192 Edit. Your pipeline.", status: "live" },
  { id: "ideas", name: "IDEAS", tagline: "Jo bola, wo kahin khoya nahi \u2014 dictations se seedha script tak.", status: "live", optIn: true },
  { id: "trends", name: "TRENDS", tagline: "Community reel directory \u2014 curate lists, publish them.", status: "live" },
  { id: "teardown",   name: "TEARDOWN",   tagline: "Any reel, pulled apart — why it went viral.",     status: "soon" },
  { id: "storyboard", name: "REEL → STORYBOARD", tagline: "Turn any reel into a shot-by-shot board.", status: "soon" },
];
