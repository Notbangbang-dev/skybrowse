# Security Policy

## Reporting a vulnerability

Please do **not** report security vulnerabilities through public GitHub issues.

Instead:

1. Use GitHub's **private vulnerability reporting** on this repository (Security tab → Report a vulnerability), if enabled, or
2. Open a minimal issue titled "Security report — please enable private reporting" with no technical details, and a maintainer will follow up with a private channel.

Please include: a description of the issue, steps to reproduce, affected versions, and potential impact. You can expect an acknowledgement as soon as a maintainer is available — this is a small open source project, not a commercial product, so turnaround times vary.

## Scope

SkyBrowse is built around treating web content as hostile: sandboxed guests, no Node integration in web content, context isolation, a narrow validated IPC surface, certificate errors that block, and permissions denied by default. Bugs that break any of those boundaries, bypass them, or otherwise allow web content to escape its sandbox are in scope. General bugs (rendering glitches, crashes) can go to normal issues.
