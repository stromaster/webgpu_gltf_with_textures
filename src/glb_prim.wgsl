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

struct MaterialParams {
    baseColorFactor: float4,
};

@group(2) @binding(0) var linearSampler: sampler;
@group(2) @binding(1) var baseTexture: texture_2d<f32>;
@group(2) @binding(2) var normalTexture: texture_2d<f32>;
@group(2) @binding(3) var occlusionTexture: texture_2d<f32>;
@group(2) @binding(4) var emissiveTexture: texture_2d<f32>;
@group(2) @binding(5) var metallicRoughnessTexture: texture_2d<f32>;
@group(2) @binding(6) var<uniform> materialParams: MaterialParams;

const MANUAL_GAMMA_CORRECT = true; //TODO: use srgb samplers and targets

@fragment
fn fragment_main(in: VertexOutput) -> @location(0) float4 {
    let skyAmbient = float3(0.05,0.08,0.1);
    let groundAmbient = float3(0.05,0.05,0.05);
    let lightDir = normalize(float3(1,1,1));
    let lightColor = float3(2.5,2.2,2.1);

    let worldNormal = normalize(in.world_norm);
    let tangentNormal = textureSample(normalTexture, linearSampler, in.uv).xyz * 2 - 1;
    let normal = worldNormal; //TODO: add tangents and bumpmapping
    var occlusion = textureSample(occlusionTexture, linearSampler, in.uv).x;
    let emissive = textureSample(emissiveTexture, linearSampler, in.uv).xyz;
    var baseColor = textureSample(baseTexture, linearSampler, in.uv);
    if (MANUAL_GAMMA_CORRECT) {
        baseColor = float4(pow(baseColor.xyz, float3(2.2,2.2,2.2)), baseColor.w);
    }
    baseColor = baseColor * materialParams.baseColorFactor;

    let ambient = mix(groundAmbient, skyAmbient, normal.y * 0.5 + 0.5);
    let diffuse = lightColor * saturate(dot(normal,lightDir));

    var finalColor = baseColor.xyz * (ambient + diffuse) * occlusion + emissive;
    if (MANUAL_GAMMA_CORRECT){
        finalColor = pow(finalColor, float3(1.0/2.2,1.0/2.2,1.0/2.2));
    }

    return float4(finalColor, baseColor.w);
}
