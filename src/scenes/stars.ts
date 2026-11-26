export function starfield(): string {
  return `<div class="starfield" aria-hidden="true">${Array.from({ length: 150 }, (_, index) => `<span class="star${index % 19 === 0 ? ' star-bright' : ''}" style="--x:${(Math.random() * 100).toFixed(2)}%;--y:${(Math.random() * 100).toFixed(2)}%;--size:${(.7 + Math.random() * 1.4).toFixed(2)}px;--duration:${(2.8 + Math.random() * 4.5).toFixed(2)}s;--delay:${(-Math.random() * 8).toFixed(2)}s;--brightness:${(.45 + Math.random() * .5).toFixed(2)}"></span>`).join('')}</div>`
}
