import { createServer } from "node:http";
const srv = createServer((_req, res) => res.end("ok"));
srv.on("error", (e) => { console.log("LISTEN_ERROR", (e as NodeJS.ErrnoException).code); process.exit(0); });
srv.listen(4055, "127.0.0.1", () => { console.log("LISTEN_OK", JSON.stringify(srv.address())); srv.close(); process.exit(0); });
setTimeout(() => { console.log("TIMEOUT"); process.exit(0); }, 2000);
