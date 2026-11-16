// Отсечение невидимого (occlusion culling) для лабиринта на сетке.
// Каждый кадр из глаз игрока по карте пускается веер лучей (DDA по тайлам).
// Тайлы, до которых долетел луч, считаются видимыми; лучи гаснут на стенах.
// Куски карты (чанки CH×CH), в которые не попал ни один луч, не рисуются вовсе:
// ни стены, ни реквизит, ни охрана — как «стриминг» в больших open-world играх.

export class Visibility {
  constructor(MW, MH, CH) {
    this.MW = MW; this.MH = MH; this.CH = CH;
    this.NCX = Math.ceil(MW / CH); this.NCY = Math.ceil(MH / CH);
    this.tileGen = new Uint32Array(MW * MH);
    this.chunkGen = new Uint32Array(this.NCX * this.NCY);
    this.gen = 1;
    this.list = new Int32Array(MW * MH); this.n = 0;
    this.rays = 0; this.tilesSeen = 0; this.chunksSeen = 0;
  }
  chunkOf(tx, ty) {
    const cx = Math.min(this.NCX - 1, Math.max(0, Math.floor(tx / this.CH)));
    const cy = Math.min(this.NCY - 1, Math.max(0, Math.floor(ty / this.CH)));
    return cy * this.NCX + cx;
  }
  tileVisible(tx, ty) {
    tx = Math.floor(tx); ty = Math.floor(ty);
    if (tx < 0 || ty < 0 || tx >= this.MW || ty >= this.MH) return false;
    return this.tileGen[ty * this.MW + tx] === this.gen;
  }
  chunkVisible(ci) { return this.chunkGen[ci] === this.gen; }
  /** Виден ли кусок карты, в котором стоит точка (в тайлах). */
  pointVisible(tx, ty) { return this.chunkGen[this.chunkOf(tx, ty)] === this.gen; }

  _mark(x, y) {
    const i = y * this.MW + x;
    if (this.tileGen[i] !== this.gen) { this.tileGen[i] = this.gen; this.list[this.n++] = i; }
  }

  /**
   * px, py — позиция игрока в тайлах; fx, fy — направление взгляда (единичный вектор на плоскости);
   * halfFov — половина горизонтального угла обзора (рад) с запасом; maxDist — дальность в тайлах;
   * opaque(x, y) — непрозрачный ли тайл.
   */
  compute(px, py, fx, fy, halfFov, maxDist, opaque) {
    this.gen++; this.n = 0;
    const { MW, MH } = this;
    // всё вплотную вокруг игрока (смотрит под ноги, оборачивается)
    const ix = Math.floor(px), iy = Math.floor(py);
    for (let y = iy - 2; y <= iy + 2; y++) for (let x = ix - 2; x <= ix + 2; x++)
      if (x >= 0 && y >= 0 && x < MW && y < MH) this._mark(x, y);

    const base = Math.atan2(fy, fx);
    // плотность лучей: ~1 луч на 1/(дальность) радиана, чтобы не пропускать проёмы в 1 тайл
    const N = Math.min(420, Math.max(90, Math.ceil(halfFov * 2 * maxDist * 1.6)));
    this.rays = N;
    for (let k = 0; k <= N; k++) {
      const a = base - halfFov + (2 * halfFov * k) / N;
      this._ray(px, py, Math.cos(a), Math.sin(a), maxDist, opaque);
    }

    // чанки: тайл + соседи (объекты на границе чанков, стены соседнего чанка)
    const { CH, NCX } = this;
    for (let k = 0; k < this.n; k++) {
      const i = this.list[k], x = i % MW, y = (i / MW) | 0;
      const cx0 = Math.floor(Math.max(0, x - 1) / CH), cx1 = Math.floor(Math.min(MW - 1, x + 1) / CH);
      const cy0 = Math.floor(Math.max(0, y - 1) / CH), cy1 = Math.floor(Math.min(MH - 1, y + 1) / CH);
      for (let cy = cy0; cy <= cy1; cy++) for (let cx = cx0; cx <= cx1; cx++) this.chunkGen[cy * NCX + cx] = this.gen;
    }
    this.tilesSeen = this.n;
    let c = 0; for (let i = 0; i < this.chunkGen.length; i++) if (this.chunkGen[i] === this.gen) c++;
    this.chunksSeen = c;
  }

  _ray(px, py, dx, dy, maxDist, opaque) {
    const { MW, MH } = this;
    let x = Math.floor(px), y = Math.floor(py);
    const sx = dx > 0 ? 1 : -1, sy = dy > 0 ? 1 : -1;
    const tdx = dx !== 0 ? Math.abs(1 / dx) : 1e9, tdy = dy !== 0 ? Math.abs(1 / dy) : 1e9;
    let tx = dx !== 0 ? (dx > 0 ? (x + 1 - px) : (px - x)) * tdx : 1e9;
    let ty = dy !== 0 ? (dy > 0 ? (y + 1 - py) : (py - y)) * tdy : 1e9;
    let t = 0;
    while (t < maxDist) {
      if (tx < ty) { x += sx; t = tx; tx += tdx; } else { y += sy; t = ty; ty += tdy; }
      if (x < 0 || y < 0 || x >= MW || y >= MH) return;
      this._mark(x, y);
      if (opaque(x, y)) return;
    }
  }
}
