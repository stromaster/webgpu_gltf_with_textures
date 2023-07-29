alias float4 = vec4<f32>;
alias float3 = vec3<f32>;
alias float2 = vec2<f32>;

struct VertexInput {
    @location(0) position: float3,
};

struct VertexOutput {
    @builtin(position) position: float4,
    @location(0) world_pos: float3,
    @location(1) uv: float2,
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

@group(1) @binding(1) var baseTexture: texture_2d<f32>;
@group(1) @binding(2) var linearSampler: sampler;

@vertex
fn vertex_main(vert: VertexInput) -> VertexOutput {
    var out: VertexOutput;
    var world_pos = node_params.transform * float4(vert.position, 1.0);
    world_pos = float4(world_pos.xyz, 1.0);
    out.position = view_params.view_proj * world_pos;
    out.world_pos = world_pos.xyz;
    out.uv = vert.position.yz; //TODO0: use real UV from mesh
    return out;
};

@fragment
fn fragment_main(in: VertexOutput) -> @location(0) float4 {
    let dx = dpdx(in.world_pos);
    let dy = dpdy(in.world_pos);
    let n = normalize(cross(dx, dy));
    let baseColor = textureSample(baseTexture, linearSampler, in.uv);
    return float4((n + 1.0) * 0.2 + baseColor.xyz * 0.8, 1.0);
}
