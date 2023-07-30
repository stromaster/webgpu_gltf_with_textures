alias float4 = vec4<f32>;
alias float3 = vec3<f32>;
alias float2 = vec2<f32>;

struct VertexInput {
    @location(0) position: float3,
    @location(1) normal: float3,
    @location(2) uv: float2,
};

struct VertexOutput {
    @builtin(position) position: float4,
    @location(0) world_pos: float3,
    @location(1) world_norm: float3,
    @location(2) uv: float2,
};

struct ViewParams {
    view_proj: mat4x4<f32>,
};

struct NodeParams {
    transform: mat4x4<f32>,
};

@group(0) @binding(0)
var<uniform> view_params: ViewParams;

@group(1) @binding(0)
var<uniform> node_params: NodeParams;

@vertex
fn vertex_main(vert: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    var world_pos = node_params.transform * float4(vert.position, 1.0);
    var world_norm = node_params.transform * float4(vert.normal, 0.0);

    out.position = view_params.view_proj * world_pos;
    out.world_pos = world_pos.xyz;
    out.world_norm = world_norm.xyz;
    out.uv = vert.uv;

    return out;
};

@group(2) @binding(0) var linearSampler: sampler;
@group(2) @binding(1) var baseTexture: texture_2d<f32>;
@group(2) @binding(2) var occlusionTexture: texture_2d<f32>;

@fragment
fn fragment_main(in: VertexOutput) -> @location(0) float4 {
    let n = normalize(in.world_norm);
    let ldir = normalize(float3(1,1,1));

    let skyAmbient = float3(0.1,0.2,0.3);
    let groundAmbient = float3(0.1,0.15,0.12);
    let baseColor = textureSample(baseTexture, linearSampler, in.uv);
    let occlusion = textureSample(occlusionTexture, linearSampler, in.uv);

    let ambient = mix(groundAmbient, skyAmbient, n.y * 0.5 + 0.5) * occlusion.x;
    let diffuse = float3(2.5,2.2,2.1) * baseColor.xyz * saturate(dot(n,ldir));

    return float4(ambient + diffuse, baseColor.w);
}
