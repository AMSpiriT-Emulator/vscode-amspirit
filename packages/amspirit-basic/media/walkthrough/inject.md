# Inject your first BASIC program

Create a file called `hello.bas` and paste:

```basic
10 MODE 1
20 PRINT "HELLO FROM VS CODE!"
30 GOTO 20
```

Then use one of the BASIC actions:

| Shortcut       | Command                        |
| -------------- | ------------------------------ |
| `F6`           | Inject & Run                   |
| `Shift+F6`     | Reset & Run                    |
| `Ctrl+F6`      | Inject (no RUN, type `RUN`↵)   |

> Locomotive BASIC requires a **line number** on every statement. Statements
> without a number are silently ignored — the extension highlights them as
> warnings in the Problems panel.
