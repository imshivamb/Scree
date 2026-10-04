/** A soft ring that trails the pointer and names what you are about to do. */
export function startCursor(): void {
  const cursor = document.querySelector<HTMLElement>(".cursor");
  const label = cursor?.querySelector<HTMLElement>(".cursor-label");
  if (!cursor || !label) return;

  let x = window.innerWidth / 2;
  let y = window.innerHeight / 2;
  let shownX = x;
  let shownY = y;

  window.addEventListener("pointermove", (event) => {
    x = event.clientX;
    y = event.clientY;
    cursor.classList.add("is-visible");
    const target = (event.target as Element | null)?.closest("a, button");
    const name = target?.classList.contains("effect")
      ? "Play"
      : target?.classList.contains("install")
        ? "Copy"
        : target
          ? "Open"
          : "";
    cursor.classList.toggle("is-hover", Boolean(name));
    label.textContent = name;
  });
  document.addEventListener("pointerleave", () => cursor.classList.remove("is-visible"));

  const follow = () => {
    shownX += (x - shownX) * 0.2;
    shownY += (y - shownY) * 0.2;
    cursor.style.transform = `translate3d(${shownX}px, ${shownY}px, 0)`;
    requestAnimationFrame(follow);
  };
  requestAnimationFrame(follow);
}
