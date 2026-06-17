; Sample Z80 program exercising CPC firmware vectors, for the amspirit-z80
; debugger. Two things to try:
;
;   * Call-stack reconstruction — put a breakpoint on the `call TXT_OUTPUT`
;     line inside print_char and launch. The Call Stack shows three user
;     frames mapped to source: print_char -> print_msg -> start.
;   * Firmware labels — from that stop, Step Into the `call TXT_OUTPUT`. PC
;     lands on the firmware jumpblock entry &BB5A, so the top Call Stack frame
;     reads "TXT OUTPUT (0xBB5A)"; the frame below it stays on print_char.
;
; Assemble with:  sjasmplus --fullpath --sld=vectors.sld vectors.asm
; The .sld sits next to this file and is auto-detected by the extension.

    DEVICE AMSTRADCPC6128

TXT_OUTPUT      equ 0xBB5A      ; firmware: send the char in A to the text VDU
TXT_SET_CURSOR  equ 0xBB75      ; firmware: move the text cursor (H=col, L=row)

    ORG 0x8000

start:
    ld h, 1                     ; column 1
    ld l, 1                     ; row 1
    call TXT_SET_CURSOR         ; home the cursor (another firmware vector)
    ld hl, message              ; HL -> NUL-terminated string
    call print_msg              ; <- Step Into here to walk the user call stack
    ret                         ; return to the firmware / loader

; Print the NUL-terminated string at HL, one char at a time.
print_msg:
.next:
    ld a, (hl)                  ; fetch next character
    or a                        ; reached the terminating 0?
    ret z
    inc hl
    call print_char             ; nested call -> a deeper user frame
    jr .next

; Print the single character held in A.
print_char:
    call TXT_OUTPUT             ; <- breakpoint here, then Step Into for the label
    ret

message:
    db "HELLO CPC", 13, 10, 0

    SAVEBIN "vectors.bin", start, $ - start
