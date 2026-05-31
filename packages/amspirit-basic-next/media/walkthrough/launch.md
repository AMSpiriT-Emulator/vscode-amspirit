# Launch the emulator

Run **AMSpiriT: Launch Emulator** from the command palette (or click the
AMSpiriT status-bar item).

The extension spawns the binary with:

```
amspirit-lite-sdl --web-server --web-port <port>
```

The status bar will switch from the warning colour to a green indicator as soon
as the periodic ping reaches the emulator (every 3 s).

If something goes wrong, open the **AMSpiriT** output channel — every launch,
exit code and error is logged there.
