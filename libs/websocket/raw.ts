import { Future } from "npm:@hazae41/future@1.0.3";

export async function openOrThrow(url: string) {
  const socket = new WebSocket(url)
  const future = new Future<void>()

  const onOpen = () => {
    future.resolve()
  }

  const onError = (event: Event) => {
    future.reject(new Error("Errored", { cause: event }))
  }

  const onClose = (event: CloseEvent) => {
    future.reject(new Error("Closed", { cause: event }))
  }

  try {
    socket.addEventListener("open", onOpen, { passive: true })
    socket.addEventListener("error", onError, { passive: true })
    socket.addEventListener("close", onClose, { passive: true })

    await future.promise

    return socket
  } finally {
    socket.removeEventListener("open", onOpen)
    socket.removeEventListener("error", onError)
    socket.removeEventListener("close", onClose)
  }
}