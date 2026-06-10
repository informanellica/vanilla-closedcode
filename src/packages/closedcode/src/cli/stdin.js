// Read piped stdin without blocking forever. `for await (const chunk of stdin)`
// only returns on EOF; when closedcode is launched in the background or inherits a
// pipe/tty that never closes (CI, `&`, redirected harnesses), stdin never reaches EOF
// and the whole run wedges BEFORE the server/agent loop starts (looks like a hang with
// an empty log).
//
// The grace window applies ONLY until the first byte: if nothing arrives within it we
// conclude there is no piped input and proceed (this is what rescues the idle/open
// stdin). Once any data has arrived we cancel the timer and read to real EOF, so a
// producer that streams with gaps between chunks is not truncated — but a producer
// whose FIRST byte arrives after the window is treated as no input. That is why the
// caller only enables the window when an argv message exists (stdin is auxiliary);
// when stdin is the sole input source we wait for real EOF instead
// (`(sleep 1; echo "fix this") | closedcode run` must not lose its message).
// Grace is overridable via CLOSEDCODE_STDIN_IDLE_MS (default 250ms); pass Infinity
// to disable the window and read to EOF unconditionally.
export function readPipedStdin(
  firstByteGraceMs = Number(process.env.CLOSEDCODE_STDIN_IDLE_MS) || 250,
  stdin = process.stdin
) {
  return new Promise(resolve => {
    let data = "";
    let started = false;
    const finish = () => {
      if (timer) clearTimeout(timer);
      stdin.off("data", onData);
      stdin.off("end", finish);
      stdin.off("error", finish);
      stdin.pause();
      resolve(data);
    };
    const onData = chunk => {
      // First byte means stdin really is piped: stop the grace timer and let the
      // stream run to EOF so nothing is dropped, however slowly it trickles in.
      if (!started) {
        started = true;
        if (timer) clearTimeout(timer);
      }
      data += chunk.toString("utf8");
    };
    const timer = Number.isFinite(firstByteGraceMs)
      ? setTimeout(() => {
          if (!started) finish();
        }, firstByteGraceMs)
      : undefined;
    stdin.on("data", onData);
    stdin.on("end", finish);
    stdin.on("error", finish);
    stdin.resume();
  });
}
