// This file is auto-generated by wgsl-gen. Do not edit manually.

#pragma once
#ifndef INCLUDED_BY_WGSL_GEN_IMPL
#error "This file is expected to be included by wgsl-gen impl. Do not include it directly."
#endif

// String table constants
constexpr const char* __str_0 = "@vertex\nfn vs_main() -> @builtin(position) vec4f {\n    return vec4f(0.0, 0.0, 0.0, 1.0);\n}\n\n";
constexpr const char* __str_1 = "fn blur_sample(tex: texture_2d<f32>, uv: vec2f) -> vec4f {\n    return textureSample(tex, samp, uv);\n}\n";
constexpr const char* __str_2 = "@fragment\nfn fs_main() -> @location(0) vec4f {\n    return vec4f(1.0, 0.0, 0.0, 1.0);\n}\n\n";
