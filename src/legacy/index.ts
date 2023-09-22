import * as math from 'mathjs';

const screenDimension = [800, 800];

const mainCanvas = document.getElementById('main-canvas') as HTMLCanvasElement;
mainCanvas.width = screenDimension[0];
mainCanvas.height = screenDimension[1];

const ctx = mainCanvas.getContext('2d') as CanvasRenderingContext2D;
// const data = ctx.getImageData(0, 0, screenDimension[0], screenDimension[1]);
const data = ctx.createImageData(screenDimension[0], screenDimension[1])
const pixels = data.data;

const color_pixel = (pixels: Uint8ClampedArray, i: number, r: number, g: number, b: number) => {
    pixels[i] = r;
    pixels[i + 1] = g;
    pixels[i + 2] = b;
    pixels[i + 3] = 255;
}

const get_pixel = (pixels: Uint8ClampedArray, i: number, pax: number, pay: number) : [number, number, number] => {
    let ax = pax | 0;
    let ay = pay | 0;

    let dx = pax - ax;
    let dy = pay - ay;

    let w = screenDimension[0];
    let l = ax;
    let r = ax + 1;
    let t = ay;
    let b = ay + 1;

    const get = (i : number): [number, number, number] => [pixels[i], pixels[i + 1], pixels[i + 2]];
    const lerp = (a: [number, number, number], b: [number, number, number], t: number): [number, number, number] => [
        a[0] * (1 - t) + b[0] * t,
        a[1] * (1 - t) + b[1] * t,
        a[1] * (1 - t) + b[1] * t
    ];

    let tli = (l + t*w)*4;
    let tri = (r + t*w)*4;
    let bli = (l + b*w)*4;
    let bri = (r + b*w)*4;
    let tlic = get(tli);
    let tric = get(tri);
    let blic = get(bli);
    let bric = get(bri);
    let xtc = lerp(tlic, tric, dx);
    let xbc = lerp(blic, bric, dx);
    let fc = lerp(xtc, xbc, dy);

    // return fc
    return get(i);
}

const HSLToRGB = (h: number, s: number, l: number): [number, number, number] => {
    s /= 100;
    l /= 100;
    const k = (n: number) => (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    const f = (n: number) => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
    return [255 * f(0), 255 * f(8), 255 * f(4)];
};

const squareSize = 20;
for(let x = 0; x < screenDimension[0]; x++){
    for(let y = 0; y < screenDimension[1]; y++){
        let i = (x + y * screenDimension[0]) * 4;
        let cx = x - screenDimension[0] / 2;
        let cy = y - screenDimension[1] / 2;

        let r = Math.sqrt(cx ** 2 + cy ** 2);
        let theta = Math.atan2(cy, cx) + Math.PI;
        let theta360 = theta / Math.PI * 180;
        let color = HSLToRGB(theta360, 100, 50);

        if(
            (Math.floor(x / squareSize) % 2 === 0 && Math.floor(y / squareSize) % 2 === 0) ||
            ((Math.floor(x / squareSize) + 1) % 2 === 0 && (Math.floor(y / squareSize) + 1) % 2 === 0)
        ){
            color = [0, 0, 0];
        }

        color_pixel(pixels, i, ...color)      
    }
}

// ctx.putImageData(data, 0, 0);


const corgi = new Image();
corgi.onload = function () {
    ctx.drawImage(corgi, 0, 0, screenDimension[0], screenDimension[1]);
    const data2 = ctx.getImageData(0, 0, screenDimension[0], screenDimension[1])
    const pixels2 = data2.data;

    const outdata = ctx.createImageData(screenDimension[0], screenDimension[1])
    const outpixels = outdata.data;

    const get_complex_color = (cx: number, cy: number) => {
        let r = Math.sqrt(cx ** 2 + cy ** 2);
        let theta = Math.atan2(cy, cx) + Math.PI;
        let theta360 = theta / Math.PI * 180;
        let color = HSLToRGB(theta360, 100, 50);

        // if(cx === 0) console.log(cx, cy)

        // let squareSize = 100
        let squareSize = 0.1
        if(
            (Math.floor(cx / squareSize) % 2 === 0 && Math.floor(cy / squareSize) % 2 === 0) ||
            ((Math.floor(cx / squareSize) + 1) % 2 === 0 && (Math.floor(cy / squareSize) + 1) % 2 === 0)
        ){
            color = [0, 0, 0];
        }

        // if(cx == 1) console.log(color);
        
        return color;
    }

    let interval_factor = 1
    const complex_calc = (a: number, b: number) => {
        const one = math.complex(1, 0);
        const z = math.complex(a, b);

        const res = math.divide(one, z); interval_factor = 10;
        // const res = math.sech(z); interval_factor = 0.5;
        // const res = math.multiply(z, z); interval_factor = 0.3;
        // const res = math.divide(one, math.multiply(z, z)); interval_factor = 5; // 1/z^2
        // const res = math.divide(one, math.sqrt(z)); interval_factor = 2;

        // const res = math.sqrt(z); interval_factor = 1;
        // const res = math.divide(math.add(z, one), math.subtract(z, one)); interval_factor = 0.05;
        // const res = z; interval_factor = 0.5;
        // const res = math.sin(z); interval_factor = 0.3;
        
        const complexRes = res as math.Complex;
        return [complexRes.re, complexRes.im];
    }

    let minX = Infinity;
    let maxX = -Infinity;
    for(let x = 0; x < screenDimension[0]; x++){
        for(let y = 0; y < screenDimension[1]; y++){
            let cx = x - screenDimension[0] / 2;
            let cy = y - screenDimension[1] / 2;
            let c = cx / (screenDimension[0] / 2), d = cy / (screenDimension[1] / 2);

            let [nx, ny] = complex_calc(c, d);

            if(nx < minX) minX = nx;
            if(nx > maxX) maxX = nx;
        }
    }
    let interval = (maxX - minX);
    if(interval === Infinity || interval === -Infinity) interval = 1;
    interval *= interval_factor;

    for(let x = 0; x < screenDimension[0]; x++){
        for(let y = 0; y < screenDimension[1]; y++){
            let i = (x + y * screenDimension[0]) * 4;
            let cx = x - screenDimension[0] / 2;
            let cy = y - screenDimension[1] / 2;

            let c = cx / (screenDimension[0] / 2), d = cy / (screenDimension[1] / 2);
            let [nx, ny] = complex_calc(c, d);
            nx /= interval;
            ny /= interval;

            let pax = nx * screenDimension[0] / 2 + screenDimension[0] / 2
            let pay = ny * screenDimension[1] / 2 + screenDimension[1] / 2
            let ax = pax | 0, ay = pay | 0;
            let ai = (ax + ay * screenDimension[0]) * 4

            let curcolor2 = get_complex_color(nx, ny);
            color_pixel(outpixels, i, ...curcolor2)

            // let curcolor2 = get_complex_color(nx, ny);
            // let curcolor = get_pixel(pixels2, ai, pax, pay);
            // let f = 1

            // color_pixel(outpixels, i, 
            //     curcolor[0] * f + curcolor2[0] * (1 - f),
            //     curcolor[1] * f + curcolor2[1] * (1 - f),
            //     curcolor[2] * f + curcolor2[2] * (1 - f)
            // );
        }
    }

ctx.putImageData(outdata, 0, 0);
};
corgi.src = '/web/corgi.jpg';
