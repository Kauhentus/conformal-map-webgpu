# conformal-map-webgpu

Website that visualizes conformal maps associated with complex functions. Runs with WebGPU for real-time interactivity. Iterated functions and animated variables are supported (via `iter` and `t` respectively).

Try it out here: https://the3dsquare.com/conformal/

### Todo:

* Error dialog if device does not support WebGPU
* Optimize WGSL shader program (it's bad...)
* Implement `asinh`, `acosh`, and `atanh` and validate principle branches
* Increase speed and accuracy of `gamma` function calculation
* Implement `jacobi`, `elliptic`, `bessel`, `airy`, and `zeta` functions
* Improve multisampling antialiasing so it's true MSAA
* Extend math grammar for more complex expressions