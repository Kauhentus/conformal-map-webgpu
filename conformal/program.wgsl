@group(0) @binding(0) var<uniform> uniforms : vec4f;
@group(0) @binding(1) var<uniform> uniforms2 : vec4f;

@vertex 
fn vertexMain(@builtin(vertex_index) i : u32) ->
    @builtin(position) vec4f {
    const pos = array(
        vec2f(-1, 1), vec2f(-1, -1), vec2f(1, -1),
        vec2f(-1, 1), vec2f(1, -1), vec2f(1, 1),
    );
    return vec4f(pos[i], 0, 1);
}

fn HSlk (n: f32, h: f32) -> f32 {
    return (n + h / 30.0) % 12.0;
}
fn HSlf (n: f32, l: f32, h: f32, a: f32) -> f32 {
    return l - a * max(-1.0, min(HSlk(n, h) - 3.0, min(9.0 - HSlk(n, h), 1.0)));
}
fn HSLtoRGB(h: f32, ps: f32, pl: f32) -> vec3f {
    let s: f32 = ps / 100.0;
    let l: f32 = pl / 100.0;
    let a: f32 = s * min(l, 1 - l);
    let r: f32 = HSlf(0.0, l, h, a);
    let g: f32 = HSlf(8.0, l, h, a);
    let b: f32 = HSlf(4.0, l, h, a);
    return vec3f(r, g, b);
}

fn get_complex_color(cx: f32, cy: f32) -> vec3f {
    let pi: f32 = 3.1415926535897;
    let r: f32 = sqrt(cx * cx + cy * cy);
    let theta: f32 = atan2(cy, cx) + pi;

    let theta360: f32 = theta / pi * 180.0;
    var color = HSLtoRGB(theta360, 100.0, 50.0);

    let squareSize: f32 = 0.25;
    let sign_x: f32 = floor(cx / squareSize);
    let sign_y: f32 = floor(cy / squareSize);
    if(sign_x % 2 == 0 && sign_y % 2 == 0){
        color = vec3f(0.0, 0.0, 0.0);
    } else if((sign_x + 1) % 2 == 0 && (sign_y + 1) % 2 == 0){
        color = vec3f(0.0, 0.0, 0.0);
    }

    // if(1 < r && r < 1.1){
    //     color = vec3f(1.0, 1.0, 1.0);
    // }

    return color;
}

fn c_add(z1: vec2f, z2: vec2f) -> vec2f {
    let a = z1.x;
    let b = z1.y;
    let c = z2.x;
    let d = z2.y;

    let re = a + c;
    let im = b + d;

    return vec2f(re, im);
}

fn c_sub(z1: vec2f, z2: vec2f) -> vec2f {
    let a = z1.x;
    let b = z1.y;
    let c = z2.x;
    let d = z2.y;

    let re = a - c;
    let im = b - d;

    return vec2f(re, im);
}

fn c_div(z1: vec2f, z2: vec2f) -> vec2f {
    let a = z1.x;
    let b = z1.y;
    let c = z2.x;
    let d = z2.y;

    let denom = c*c + d*d;
    let re = (a*c + b*d) / denom;
    let im = (b*c - a*d) / denom;

    return vec2f(re, im);
}

fn c_mul(z1: vec2f, z2: vec2f) -> vec2f {
    let a = z1.x;
    let b = z1.y;
    let c = z2.x;
    let d = z2.y;

    let re = (a*c - b*d);
    let im = (a*d + b*c);

    return vec2f(re, im);
}

fn c_arg(z: vec2f) -> f32 {
    let a = z.x;
    let b = z.y;
    return atan2(b, a);
}

fn c_pow(z1: vec2f, z2: vec2f) -> vec2f {
    let a = z1.x;
    let b = z1.y;
    let c = z2.x;
    let d = z2.y;

    let e: f32 = 2.7182818284590;
    let carg = c_arg(vec2f(a, b));
    let common_fac = pow(a*a + b*b, c/2.0) * pow(e, -d * carg);
    let theta = c*carg + 0.5 * d * log(a*a + b*b);
    let re = common_fac * cos(theta);
    let im = common_fac * sin(theta);

    return vec2f(re, im);
}

fn c_sqrt(z: vec2f) -> vec2f {
    let a = z.x;
    let b = z.y;
    let m = sqrt(a*a + b*b);

    let re = sqrt((m + a) / 2.0);
    let im = b / abs(b) * sqrt((m - a) / 2.0);

    return vec2f(re, im);
}

fn c_log(z: vec2f) -> vec2f {
    let a = z.x;
    let b = z.y;
    let carg = c_arg(vec2f(a, b));

    let re = log(sqrt(a*a + b*b));
    let im = carg;

    return vec2f(re, im);
}

fn c_sin(z: vec2f) -> vec2f {
    let a = z.x;
    let b = z.y;

    let re = sin(a) * cosh(b);
    let im = cos(a) * sinh(b);

    return vec2f(re, im);
}

fn c_cos(z: vec2f) -> vec2f {
    let a = z.x;
    let b = z.y;

    let re = cos(a) * cosh(b);
    let im = -sin(a) * sinh(b);

    return vec2f(re, im);
}

fn c_tan(z: vec2f) -> vec2f {
    let a = z.x;
    let b = z.y;

    let num = vec2f(sin(2*a), sinh(2*b));
    let den = vec2f(cos(2*a) + cosh(2*b), 0.0);

    return c_div(num, den);
}

fn c_sinh(z: vec2f) -> vec2f {
    let a = z.x;
    let b = z.y;

    let re = sinh(a) * cos(b);
    let im = cosh(a) * sin(b);

    return vec2f(re, im);
}

fn c_cosh(z: vec2f) -> vec2f {
    let a = z.x;
    let b = z.y;

    let re = cosh(a) * cos(b);
    let im = sinh(a) * sin(b);

    return vec2f(re, im);
}

fn c_tanh(z: vec2f) -> vec2f {
    let a = z.x;
    let b = z.y;

    let num = vec2f(sinh(2*a), sin(2*b));
    let den = vec2f(cosh(2*a) + cos(2*b), 0.0);

    return c_div(num, den);
}

fn c_asin(z: vec2f) -> vec2f {
    let a = z.x;
    let b = z.y;

    let one = vec2f(1.0, 0.0);
    let i = vec2f(0.0, 1.0);
    let fac = c_div(one, i);
    let num_inside = (c_add(c_mul(i,z), c_sqrt(c_sub(one, c_mul(z, z)))));

    return c_mul(fac, c_log(num_inside));
}

fn c_acos(z: vec2f) -> vec2f {
    let a = z.x;
    let b = z.y;

    let one = vec2f(1.0, 0.0);
    let i = vec2f(0.0, 1.0);
    let fac = c_div(one, i);
    let num_inside = (c_add(z, c_mul(c_sqrt(c_sub(one, c_mul(z, z))), i)));

    return c_mul(fac, c_log(num_inside));
}

fn c_atan(z: vec2f) -> vec2f {
    let a = z.x;
    let b = z.y;

    let one = vec2f(1.0, 0.0);
    let i = vec2f(0.0, 1.0);
    let fac = c_div(one, c_mul(vec2f(2.0, 0.0), i));
    let num_inside = c_div(c_sub(i, z), c_add(i, z));

    return c_mul(fac, c_log(num_inside));
}

fn c_gamma(z: vec2f) -> vec2f {
    let a = z.x;
    let b = z.y;
    let one = vec2f(1.0, 0.0);
    let i = vec2f(0.0, 1.0);

    let fac = c_div(one, z);
    var cum = one;

    for(var _n = 1; _n < 20; _n++){ // 20 iterations to approx via euler form of the gamma function
        let n = vec2f(f32(_n), 0.0);
        let inner_facA = c_div(one, c_add(one, c_div(z, n)));
        let inner_facB = c_pow(c_add(one, c_div(one, n)), z);
        cum = c_mul(cum, c_mul(inner_facA, inner_facB));
    }

    return c_mul(fac, cum);
}

fn lerp(a: vec3f, b: vec3f, t: f32) -> vec3f {
    return vec3f(
        a[0] * t + b[0] * (1 - t),
        a[1] * t + b[1] * (1 - t),
        a[2] * t + b[2] * (1 - t)
    );
}

fn rand_lgc(x: i32, y: i32) -> i32 {
    let rng_state = 1664525 * (x + y) + 1013904223;
    return rng_state;
}

fn rand_xorshift(x: i32, y: i32) -> f32 {
    var rng_state = rand_lgc(x, y);
    rng_state ^= (rng_state << 13);
    rng_state += x;
    rng_state ^= (rng_state >> 17);
    rng_state += y;
    rng_state ^= (rng_state << 5);
    var frng: f32 = f32(rng_state);
    return frng * (1.0 / 4294967296.0);
}

fn sample(x: f32, y: f32, w: f32, h: f32) -> vec3f {
    let s: f32 = uniforms[0];
    let dx: f32 = uniforms[1];
    let dy: f32 = uniforms[2];

    // clear version
    // let cx: f32 = (x - (w/2.0)) / (w/2.0) * s - dx / (w/2.0);
    // let cy: f32 = (y - (h/2.0)) / (h/2.0) * s - dy / (h/2.0);

    let hw = f32(w) / 2.0;
    let hh = f32(h) / 2.0;
    let h_longer = max(hw, hh);
    let cx: f32 = ((x - hw) * s - dx) / h_longer;
    let cy: f32 = ((y - hh) * s - dy) / h_longer;

    // let one = vec2f(1.0, 0.0);
    let time: f32 = uniforms[3] / 1000.0; // in seconds
    let dt: f32 = time;
    let t = vec2f(dt, 0.0);
    let one = vec2f(1.0, 0);
    let z = vec2f(cx, cy);

    let zp = [[EXPR]];

    let color = get_complex_color(zp[0], zp[1]);
    return color;
}

@fragment 
fn fragmentMain(@builtin(position) coord_in: vec4<f32>) -> @location(0) vec4f {
    let w: f32 = uniforms2[0];
    let h: f32 = uniforms2[1];
    let s: f32 = uniforms[0];
    let dx: f32 = uniforms[1];
    let dy: f32 = uniforms[2];
    
    let x = coord_in.x;
    let y = coord_in.y;

    // V3, random sampling
    var color = vec3f(0.0, 0.0, 0.0);
    let sample_count: i32 = 20;
    for(var i = 0; i < sample_count; i++){
        let px = rand_xorshift(i32(y) + i, i32(x)) * 2 - 1;
        let py = rand_xorshift(-i32(x) - i, i32(y)) * 2 - 1;
        let c_color = sample(x + px, y + py, w, h);
        color += c_color;
    }
    color /= f32(sample_count);

    // V1, calculate pixel naively
    // let color = sample(coord_in.x, coord_in.y, w, h);

    // V2, average neighbors
    // let color_c = sample(coord_in.x, coord_in.y, w, h);
    // let color_tl = sample(coord_in.x, coord_in.y + 0.25, w, h);
    // let color_tr = sample(coord_in.x - 0.25, coord_in.y, w, h);
    // let color_bl = sample(coord_in.x, coord_in.y - 0.25, w, h);
    // let color_br = sample(coord_in.x + 0.25, coord_in.y, w, h);
    // let color_t = lerp(color_tl, color_tr, 0.5);
    // let color_b = lerp(color_bl, color_br, 0.5);
    // let color = lerp(color_c, lerp(color_t, color_b, 0.5), 0.5);
    
    return vec4f(color, 1);
}

// legacy maps:
// let zp = c_mul(z, c_mul(z, c_mul(z, z)));
// let zp = c_sin(c_add(c_div(one, z), z));
// let zp = c_sin(c_add(c_div(one, z), one));
// let zp = c_sin(c_add(c_div(one, z), c_sin(z)));
// let zp = c_sin(c_add(c_div(one, z), c_mul(c_sin(c_add(z, one)), z)));

// let zp = c_div(c_add(z, one), c_sub(z, one));
// let zp = c_div(one, z);
// let zp = c_mul(z, z); 
// let zp = c_div(one, c_mul(z, z)); 
// let zp = c_sqrt(z); 
// let zp = c_div(one, c_sqrt(z)); 

// let zp = c_sub(c_add(c_sqrt(c_sub(z, c_mul(z, z))), c_div(one, z)), c_mul(z, z)) ; 
// let zp = c_add(c_sqrt(c_sub(z, c_mul(z, z))), c_div(one, c_sqrt(z))) ; 
// let zp = c_add(
//     c_mul(z, c_mul(z, c_mul(z, z))),
//     c_mul(z, c_mul(z, z))
// );
