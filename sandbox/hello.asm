; Sample Z80 program for trying the amspirit-z80 debugger.
; Assemble with:  sjasmplus --sld=hello.sld hello.asm
; The .sld sits next to this file and is auto-detected by the extension.

    DEVICE AMSTRADCPC6128
    ORG 0x8000

start:
    ld a, 0          ; counter
loop:
    inc a            ; <- set a breakpoint here and watch A in the Registers view
    call delay
    cp 10
    jr nz, loop
    ret

delay:
    ld b, 0
.wait:
    djnz .wait
    ret

    SAVEBIN "hello.bin", start, $ - start
