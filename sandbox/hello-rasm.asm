; Sample Z80 program for the amspirit-z80 debugger, rasm syntax.
; Assemble with:  rasm hello-rasm.asm -ob hello-rasm.bin -map > hello-rasm.map
; The .map (rasm -map stdout) is auto-detected next to this file.

org #8000

start
  ld a,0          ; counter
loop
  inc a           ; <- set a breakpoint here and watch A in the Registers view
  call delay
  cp 10
  jr nz,loop
  ret

delay
  ld b,0
wait
  djnz wait
  ret
