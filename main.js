// Disclaimer: this code is ugly and unreadable

let canvas = document.getElementById("output");
let ctx = canvas.getContext("2d");
let info = document.getElementById("info");

canvas.width = canvas.clientWidth;
canvas.height = canvas.clientHeight;

let xhr = new XMLHttpRequest();
xhr.open("GET", "./earth.csv");
xhr.onload = () => {
  let xhr2 = new XMLHttpRequest();
  xhr2.open("GET", "./mars.csv");
  xhr2.onload = () => {

    earth = xhr.response.split("\n").slice(5).map(x => x.split(/, +/g)).map(arr => {
      return [new Date(arr[1]), +arr[2], +arr[3], +arr[5], +arr[6]];
    }).filter(([_, x, y]) => !isNaN(x) && !isNaN(y));
    mars = xhr2.response.split("\n").slice(5).map(x => x.split(/, +/g)).map(arr => {
      return [new Date(arr[1]), +arr[2], +arr[3], +arr[5], +arr[6]];
    }).filter(([_, x, y]) => !isNaN(x) && !isNaN(y));
    draw();
  }
  xhr2.send();
}
xhr.send();

const MINX = -2.5;
const MAXX = 2.5;
const MINY = -2.5;
const MAXY = 2.5;
let zoom = 1;
const ZOOM_FACTOR = 1.1;
const STEPS_HELIO = 27;
const STEPS_GEO = 50;
const STEP = .5;

const BLUE = "#206ebb";
const RED = "#ff4038";
const YELLOW = "#ffcc10";
const AXIS = "#ffc3ff90";

const DOTSIZE = 3;
let heliocentric = true;

let earth;
let mars;

function map(x, y) {
  let m = Math.min(canvas.width, canvas.height);
  let sx = canvas.width / 2 - m / 2;
  let sy = canvas.height / 2 - m / 2;
  return [(x * zoom - MINX) / (MAXX - MINX) * m + sx, (-y * zoom - MINY) / (MAXY - MINY) * m + sy];
}

function get(set, n) {
  return map(set[n][1], set[n][2]);
}

function dot(x, y, color, size = DOTSIZE) {
  ctx.strokeStyle = "transparent";
  ctx.fillStyle = color;
  ctx.beginPath();
  ctx.ellipse(x, y, size, size, 0, 0, Math.PI * 2);
  ctx.fill();
}

function axes() {
  let m = Math.min(canvas.width, canvas.height);
  let sx = canvas.width / 2 - m / 2;
  let sy = canvas.height / 2 - m / 2;
  ctx.strokeStyle = AXIS;
  ctx.lineWidth = 1;

  ctx.beginPath();
  ctx.moveTo(canvas.width / 2, 0);
  ctx.lineTo(canvas.width / 2, canvas.height);
  ctx.stroke();

  ctx.beginPath();
  ctx.moveTo(0, canvas.height / 2);
  ctx.lineTo(canvas.width, canvas.height / 2);
  ctx.stroke();

  for (let n = ~~MINX; n <= ~~MAXX; n += STEP) {
    let a = map(n, 0);
    let b = map(0, n);

    ctx.beginPath();
    ctx.moveTo(a[0], a[1] - 2);
    ctx.lineTo(a[0], a[1] + 2);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(b[0] - 2, b[1]);
    ctx.lineTo(b[0] + 2, b[1]);
    ctx.stroke();
  }
}

function draw() {
  if (heliocentric) {
    document.body.className = "heliocentric";
  } else {
    document.body.className = "";
  }
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  axes();

  if (!earth || !mars) return;

  if (heliocentric) {

    dot(...map(0, 0), YELLOW, DOTSIZE * 2);

    for (n = 0; n < STEPS_HELIO; n++) {
      if (earth[n]) dot(...get(earth, n), BLUE);
      if (mars[n]) dot(...get(mars, n), RED);
    }

    let closest = [-1, Infinity];
    for (n = 0; n < STEPS_HELIO; n++) {
      if (earth[n] && mars[n]) {
        let da = Math.atan2(earth[n][1], earth[n][2]) - Math.atan2(mars[n][1], mars[n][2])
        if (closest[1] > Math.abs(da)) {
          closest = [n, Math.abs(da)];
        }
      }
    }

    ctx.strokeStyle = AXIS;
    ctx.beginPath();
    ctx.setLineDash([5, 3]);
    ctx.moveTo(...get(earth, closest[0]));
    ctx.lineTo(...get(mars, closest[0]));
    ctx.stroke();
    ctx.setLineDash([1, 0]);
  } else {
    let diff = earth.map(([date, x, y], i) => [date, mars[i][1] - x, mars[i][2] - y]);

    dot(...map(0, 0), BLUE);

    for (n = 0; n < STEPS_GEO; n++) {
      dot(...get(diff, n), RED);
    }
  }
}

window.onresize = () => {
  canvas.width = canvas.clientWidth;
  canvas.height = canvas.clientHeight;
  draw();
}

window.onkeypress = (evt) => {
  if (evt.key === "+") {
    zoom *= ZOOM_FACTOR;
    draw();
  } else if (evt.key === "-") {
    zoom /= ZOOM_FACTOR;
    draw();
  }
}

window.onmousewheel = (evt) => {
  if (evt.deltaY) {
    zoom *= Math.pow(ZOOM_FACTOR, evt.deltaY / 100);
    draw();
  }
}

function find_center_circle(coords, name) {
  let res = minimize(
    2, [0, 0],
    ([cx, cy], data) => calc_sigma(data, ([x, y]) => Math.sqrt((cx - x) ** 2 + (cy - y) ** 2)),
    coords.map(([date, x, y]) => [x, y]),
    10000, 0.01, 0.1
  );

  info.innerText = `Body: ${name}\n` +
    `Method: circle\n` +
    `X: ${res[0].toFixed(6)}\n` +
    `Y: ${res[1].toFixed(6)}\n` +
    `s: ${calc_sigma(
      coords.map(([date, x, y]) => [x, y]),
      ([x, y]) => Math.sqrt((res[0] - x) ** 2 + (res[1] - y) ** 2)
    ).toFixed(6)}\n`;

  dot(...map(...res), "8c8c8cf0");
}

function find_center_ellipse(coords, name) {
  let fn = ([cx, cy, a, b, r], data) => {
    a = Math.max(a, 1e-50);
    b = Math.max(b, 1e-50);
    let c, fx1, fy1, fx2, fy2;
    if (a > b) {
      c = Math.sqrt(a ** 2 - b ** 2);
      fx1 = cx + c;
      fy1 = cy;
      fx2 = cx - c;
      fy2 = cy;
    } else {
      c = Math.sqrt(b ** 2 - a ** 2);
      fx1 = cx;
      fy1 = cy + c;
      fx2 = cx;
      fy2 = cy - c;
    }
    return sum_error(data, ([x, y]) => {
      let rx = Math.cos(r) * (x - cx) - Math.sin(r) * (y - cy) + cx;
      let ry = Math.sin(r) * (x - cx) + Math.cos(r) * (y - cy) + cy;
      let dist1 = Math.sqrt((rx - fx1) ** 2 + (ry - fy1) ** 2);
      let dist2 = Math.sqrt((rx - fx2) ** 2 + (ry - fy2) ** 2);
      return dist1 + dist2 - 2 * Math.max(a, b);
    });
  };

  let res = minimize(
    5, [0, 0, 1, 1, 0],
    fn,
    coords.map(([date, x, y]) => [x, y]),
    10000, 0.01, 0.02
  );

  let a = Math.max(res[2], 1e-50);
  let b = Math.max(res[3], 1e-50);
  let cx = res[0];
  let cy = res[1];
  let c, fx1, fy1, fx2, fy2;
  let r = res[4];
  if (a > b) {
    c = Math.sqrt(a ** 2 - b ** 2);
    fx1 = cx + c;
    fy1 = cy;
    fx2 = cx - c;
    fy2 = cy;
  } else {
    c = Math.sqrt(b ** 2 - a ** 2);
    fx1 = cx;
    fy1 = cy + c;
    fx2 = cx;
    fy2 = cy - c;
  }

  let rfx1 = Math.cos(-r) * (fx1 - cx) - Math.sin(-r) * (fy1 - cy) + cx;
  let rfy1 = Math.sin(-r) * (fx1 - cx) + Math.cos(-r) * (fy1 - cy) + cy;
  let rfx2 = Math.cos(-r) * (fx2 - cx) - Math.sin(-r) * (fy2 - cy) + cx;
  let rfy2 = Math.sin(-r) * (fx2 - cx) + Math.cos(-r) * (fy2 - cy) + cy;

  info.innerText = `Body: ${name}\n` +
    `Method: ellipse\n` +
    `X (center): ${res[0].toFixed(6)}\n` +
    `Y (center): ${res[1].toFixed(6)}\n` +
    `a: ${a.toFixed(6)}\n` +
    `b: ${b.toFixed(6)}\n` +
    `X1 (focus): ${rfx1.toFixed(6)}\n` +
    `Y1 (focus): ${rfy1.toFixed(6)}\n` +
    `X2 (focus): ${rfx2.toFixed(6)}\n` +
    `Y2 (focus): ${rfy2.toFixed(6)}\n` +
    `r (rad): ${-r.toFixed(6)}\n` +
    `E: ${sum_error(coords.map(([date, x, y]) => [x, y]), ([x, y]) => {
      let rx = Math.cos(r) * (x - cx) - Math.sin(r) * (y - cy) + cx;
      let ry = Math.sin(r) * (x - cx) + Math.cos(r) * (y - cy) + cy;
      let dist1 = Math.sqrt((rx - fx1) ** 2 + (ry - fy1) ** 2);
      let dist2 = Math.sqrt((rx - fx2) ** 2 + (ry - fy2) ** 2);
      return dist1 + dist2 - 2 * Math.max(a, b);
    }).toFixed(6)}\n`;

  dot(...map(cx, cy), "#8c8c8cf0");
  dot(...map(rfx1, rfy1), "#66ff99f0");
  dot(...map(rfx2, rfy2), "#66ff99f0");
}

function calc_sigma(data, callback) {
  let values = data.map(callback);
  let mean = values.reduce((acc, act) => acc + act, 0) / values.length;
  let s = Math.sqrt(values.reduce((acc, act) => acc + (act - mean) ** 2) / (values.length - 1), 0);
  return s;
}

function sum_error(data, callback) {
  return Math.sqrt(data.map(callback).reduce((acc, act) => acc + act ** 2, 0));
}

function minimize(len, initial, callback, data, steps, epsilon, delta) {
  function shift(arr, index, sign) {
    let res = [...arr];
    res[index] += sign * epsilon;
    return res;
  }

  function normalize(arr) {
    let len = Math.sqrt(arr.reduce((acc, act) => acc + act * act, 0));
    return arr.map(x => x / len);
  }

  let guess = initial;
  for (let n = 1; n < steps; n++) {
    let d = new Array(len).fill(0).map((_, i) => {
      let a = callback(shift(guess, i, 1), data);
      let b = callback(shift(guess, i, -1), data);
      return (b - a) / 2;
    });
    d = normalize(d);
    guess = guess.map((x, i) => x + d[i] * delta / Math.sqrt(n));
  }

  return guess;
}
