import * as nearley from "nearley";
import * as grammar from "./grammar";

const screenDims = document.body.getBoundingClientRect();
const screen_w = screenDims.width;
const screen_h = screenDims.height;
const screenDimension = [screen_w, screen_h];

const mainCanvas = document.getElementById('main-canvas') as HTMLCanvasElement;
mainCanvas.width = screenDimension[0];
mainCanvas.height = screenDimension[1];

// handle window resizing
window.addEventListener('resize', () => {
    const screenDims = document.body.getBoundingClientRect();
    const screen_w = screenDims.width;
    const screen_h = screenDims.height;
    screenDimension[0] = screen_w;
    screenDimension[1] = screen_h;

    mainCanvas.width = screenDimension[0];
    mainCanvas.height = screenDimension[1];
});

// handle scroll wheel
let linear_zoom = 0.5;
let log_zoom = Math.exp(linear_zoom);
mainCanvas.addEventListener('wheel', (ev) => {
    const direction = ev.deltaY / 1000;
    linear_zoom += direction;
    let prev_log_zoom = log_zoom;
    log_zoom = Math.exp(linear_zoom)

    position[0] += (ev.offsetX - (screenDimension[0] / 2)) * (log_zoom - prev_log_zoom)
    position[1] += (ev.offsetY - (screenDimension[1] / 2)) * (log_zoom - prev_log_zoom)
});

// handle mouse drag events
let mouseDown = false;
let position = [0, 0];
mainCanvas.addEventListener('mousedown', (ev) => {
    mouseDown = true;
});
mainCanvas.addEventListener('mousemove', (ev) => {
    if(!mouseDown) return;

    position[0] += ev.movementX * log_zoom;
    position[1] += ev.movementY * log_zoom;
});
mainCanvas.addEventListener('mouseup', (ev) => {
    mouseDown = false;
});
mainCanvas.addEventListener('mouseleave', (ev) => {
    mouseDown = false;
});

const resetViewBtn = document.getElementById('view-btn');
if(resetViewBtn) resetViewBtn.addEventListener('click', () => {
    position = [0, 0];
    linear_zoom = 0.5;
    log_zoom = Math.exp(linear_zoom);
});
const resetTimeBtn = document.getElementById('time-btn');
if(resetTimeBtn) resetTimeBtn.addEventListener('click', () => {
    frameCount = 0;
});

type GPU = {
    adapter: GPUAdapter,
    device: GPUDevice,
    context: GPUCanvasContext,
    format: GPUTextureFormat
}

const initialize = async () : Promise<GPU | undefined> => {
    const adapter = await navigator.gpu.requestAdapter();
    if(!adapter) return;
    const device = await adapter.requestDevice();

    const context = mainCanvas.getContext("webgpu");
    if(!context) return;
    const format = navigator.gpu.getPreferredCanvasFormat();
    context.configure({ device, format });

    return {
        adapter: adapter,
        device: device,
        context: context, 
        format: format
    }
}

let current = 0;
let frameCount = 0;
const compile = async (command: string, config: GPU, id: number) => {
    console.log(command)
    // initialize gpu
    const {
        adapter: adapter,
        device: device,
        context: context, 
        format: format
    } = config;

    // init buffers to pass values in via uniform buffers, 4x f32s
    const ioBufferSize = 4 * 4;
    const ioBuffer = device.createBuffer({
        size: ioBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });
    const ioBuffer2 = device.createBuffer({
        size: ioBufferSize,
        usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST
    });

    let res = await fetch('./program.wgsl')
    let text = await res.text();
    console.log(command)
    let code = text.replace('[[EXPR]]', command);
    if(iterFlag){
        code += `\n${iterCode}`;
    }

    // create gpu rendering pipeline
    const shaderModule = device.createShaderModule({ code });
    const pipeline = device.createRenderPipeline({
        layout: "auto",
        vertex: {
            module: shaderModule,
            entryPoint: "vertexMain"
        },
        fragment: {
            module: shaderModule,
            entryPoint: "fragmentMain",
            targets: [{ format }],
        },
    });

    const uniformBindGroup = device.createBindGroup({
        layout: pipeline.getBindGroupLayout(0),
        entries: [
            {
                binding: 0,
                resource: {
                    buffer: ioBuffer
                }
            },
            {
                binding: 1,
                resource: {
                    buffer: ioBuffer2
                }
            }
        ]
    });

    // fps calculation variables
    const fpsLabel = document.getElementById('fps');
    let prevTime = new Date();
    let secondCounter = new Date();
    let avgFps: number;
    frameCount = 0;
    let alpha = 0.95;

    const frame = () => {
        // update values to pass in via uniform buffers
        device.queue.writeBuffer(
            ioBuffer, 0,
            new Float32Array([log_zoom, position[0], position[1], frameCount])
        );
        device.queue.writeBuffer(
            ioBuffer2, 0,
            new Float32Array([screenDimension[0], screenDimension[1], 0, 0])
        );

        // create full draw command for gpu
        const commandEncoder = device.createCommandEncoder();
        const colorAttachments : GPURenderPassColorAttachment[] = [
            {
                view: context.getCurrentTexture().createView(),
                loadOp: "clear",
                storeOp: "store",
            },
        ];
        const passEncoder = commandEncoder.beginRenderPass({colorAttachments});
        passEncoder.setPipeline(pipeline);
        passEncoder.setBindGroup(0, uniformBindGroup);
        passEncoder.draw(6);
        passEncoder.end();
        device.queue.submit([commandEncoder.finish()]);

        // calculate and update fps
        const newTime = new Date();
        const dt = newTime.getTime() - prevTime.getTime();
        let cur_fps = 1000 / dt;
        if(!avgFps) avgFps = cur_fps;
        if(avgFps === Infinity) avgFps = 60;
        if(cur_fps === Infinity) cur_fps = 60;
        avgFps = alpha * avgFps + (1 - alpha) * cur_fps;
        if(newTime.getTime() - secondCounter.getTime() > 500){
            if(fpsLabel) fpsLabel.innerText = `FPS: ${Math.round(avgFps)}`;
            secondCounter = newTime;
        }
        prevTime = newTime;
        frameCount++;

        if(id === current) requestAnimationFrame(frame);
    }
    
    frame();
}

let gpuConfig: GPU;
initialize().then((config) => {
    if(!config) return;
    gpuConfig = config;
    compile(defaultCommand, config, 0);
});

// set up input command parsing
const defaultCommand = 'c_div(vec2f(1.0, 0.0), z)';
let iterFlag = false;
let iterCode = ``;
const parseInput = (s: string) => {
    const parser = new nearley.Parser(nearley.Grammar.fromCompiled(grammar));
    try {
        parser.feed(s);
    } catch(e){
        return '';
    }
    
    if(parser.results.length === 0) return '';    
    let result = parser.results[0];
    let error = false;
    iterFlag = false;
    iterCode = '';

    const expand = (result: any): string => {
        if(typeof result === 'string') {
            if(result === 'e') return 'vec2f(2.7182818284590, 0.0)';
            else if(result === 'pi') return 'vec2f(3.1415926535897, 0.0)';
            return result;
        }
        else if(typeof result === 'number'){
            return `vec2f(${result}, 0.0)`;
        }
        else if(typeof result === 'object') {
            if(!result.type){
                error = true;
                return '';
            }

            if(result.type === 'number'){
                return `vec2f(${result.re}, ${result.im})`;
            } else if(result.type === 'operation'){
                let op = result.op;
                let lhs = expand(result.lhs);
                let rhs = expand(result.rhs);

                if(op === '+'){
                    return `c_add(${lhs},${rhs})`
                } else if(op === '-'){
                    return `c_sub(${lhs},${rhs})`
                } else if(op === '*'){
                    return `c_mul(${lhs},${rhs})`
                } else if(op === '/'){
                    return `c_div(${lhs},${rhs})`
                } else if(op === '^'){
                    return `c_pow(${lhs},${rhs})`
                } else {
                    error = true;
                    return '';
                }
            } else if(result.type === 'function'){
                let func = result.function;
                let args = result.args.map((arg: any) => expand(arg)); 

                if(func === 'iter'){
                    if(args.length !== 2) return '';

                    iterCode = `
                    fn c_iter(z: vec2f) -> vec2f {
                        let time: f32 = uniforms[3] / 1000.0; // in seconds
                        let dt: f32 = time;
                        let t = vec2f(dt, 0.0);

                        var zp = z;
                        for(var i = 0.0; i < f32(${args[1]}[0]); i += 1.0){ // numbers are converted to complex
                            zp = ${args[0].replace(/z'/g, 'zp')};
                        }
                        return zp;
                    }
                    `;
                    iterFlag = true;

                    return `c_iter(z)`;
                } else {
                    return `c_${func}(${args.join(',')})`;
                }
            } else {
                error = true;
                return '';
            }
        }
        else {
            error = true;
            return '';
        }
    }

    let expandedResult = expand(result);
    if(expandedResult === ''){
        return '';
    } else if(error){
        return '';
    } else {
        return expandedResult;
    }
}

        
/*
Favs: 
iter((z*(t+1))^i+z'^i/(t+1),10) 
*/

let fantasyCounter = 0;
let inputs = [
    "1/iter(z+z'^(i+sin(t)),10)+1",
    "iter(z^(i*0.5)+sqrt(z'*(t+1)*i*(-1)),8)",
    "atan(i+z*(t+0.2))",
    "z+sin(z*i*t)+cos(z*i*t*2)",
    "iter(z*sqrt((t+0.5)*i)+z'^(sqrt(1/t+i)),10)",
    "iter(z*sin(t*i)+z'^i,10)",
    "z+sin(z*i*t)^(i*t*2)",
    "sin(i*z-z^(2*t))+tan(1/z-z^2)",
    "sqrt(z-z^(2*t))+1/z-z^2",
    "1/iter(z+z'^(t),8)+1",
    "t/iter(z+z'^(i+tan(t)),4)+1"
];
const pushMeButton = document.getElementById('push-me-button') as HTMLButtonElement;
pushMeButton.addEventListener('click', () => {
    next();
});

const next = () => {
    fantasyCounter += 1;
    fantasyCounter %= inputs.length;

    const result = parseInput(inputs[fantasyCounter]);
    current += 1;
    if(result !== '') compile(result, gpuConfig, current);
    console.log("RESET")
}
setInterval(() => {
    next();
}, 10000)
setTimeout(() => {
    next();
}, 1000);