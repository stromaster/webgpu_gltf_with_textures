import {mat4} from "gl-matrix";

enum GLTFRenderMode {
    POINTS = 0,
    LINE = 1,
    LINE_LOOP = 2,
    LINE_STRIP = 3,
    TRIANGLES = 4,
    TRIANGLE_STRIP = 5,
    // Note: fans are not supported in WebGPU, use should be
    // an error or converted into a list/strip
    TRIANGLE_FAN = 6,
};

enum GLTFComponentType {
    BYTE = 5120,
    UNSIGNED_BYTE = 5121,
    SHORT = 5122,
    UNSIGNED_SHORT = 5123,
    INT = 5124,
    UNSIGNED_INT = 5125,
    FLOAT = 5126,
    DOUBLE = 5130,
};

enum GLTFType {
    SCALAR = 0,
    VEC2 = 1,
    VEC3 = 2,
    VEC4 = 3,
    MAT2 = 4,
    MAT3 = 5,
    MAT4 = 6
};

function alignTo(val: number, align : number): number {
    return Math.floor((val + align - 1) / align) * align;
}

function parseGltfType(type: string): GLTFType {
    switch (type) {
        case "SCALAR":
            return GLTFType.SCALAR;
        case "VEC2":
            return GLTFType.VEC2;
        case "VEC3":
            return GLTFType.VEC3;
        case "VEC4":
            return GLTFType.VEC4;
        case "MAT2":
            return GLTFType.MAT2;
        case "MAT3":
            return GLTFType.MAT3;
        case "MAT4":
            return GLTFType.MAT4;
        default:
            throw Error(`Unhandled glTF Type ${type}`);
    }
}

function gltfTypeNumComponents(type: GLTFType) {
    switch (type) {
        case GLTFType.SCALAR:
            return 1;
        case GLTFType.VEC2:
            return 2;
        case GLTFType.VEC3:
            return 3;
        case GLTFType.VEC4:
        case GLTFType.MAT2:
            return 4;
        case GLTFType.MAT3:
            return 9;
        case GLTFType.MAT4:
            return 16;
        default:
            throw Error(`Invalid glTF Type ${type}`);
    }
}

// Note: only returns non-normalized type names,
// so byte/ubyte = sint8/uint8, not snorm8/unorm8, same for ushort
function gltfVertexType(componentType: GLTFComponentType, type: GLTFType) : string {
    let typeStr : string
    switch (componentType) {
        case GLTFComponentType.BYTE:
            typeStr = "sint8";
            break;
        case GLTFComponentType.UNSIGNED_BYTE:
            typeStr = "uint8";
            break;
        case GLTFComponentType.SHORT:
            typeStr = "sint16";
            break;
        case GLTFComponentType.UNSIGNED_SHORT:
            typeStr = "uint16";
            break;
        case GLTFComponentType.INT:
            typeStr = "int32";
            break;
        case GLTFComponentType.UNSIGNED_INT:
            typeStr = "uint32";
            break;
        case GLTFComponentType.FLOAT:
            typeStr = "float32";
            break;
        default:
            throw Error(`Unrecognized or unsupported glTF type ${componentType}`);
    }

    switch (gltfTypeNumComponents(type)) {
        case 1:
            return typeStr;
        case 2:
            return typeStr + "x2";
        case 3:
            return typeStr + "x3";
        case 4:
            return typeStr + "x4";
        default:
            throw Error(`Invalid number of components for gltfType: ${type}`);
    }
}

function gltfTypeSize(componentType: GLTFComponentType, type: GLTFType) {
    let componentSize : number = 0;
    switch (componentType) {
        case GLTFComponentType.BYTE:
            componentSize = 1;
            break;
        case GLTFComponentType.UNSIGNED_BYTE:
            componentSize = 1;
            break;
        case GLTFComponentType.SHORT:
            componentSize = 2;
            break;
        case GLTFComponentType.UNSIGNED_SHORT:
            componentSize = 2;
            break;
        case GLTFComponentType.INT:
            componentSize = 4;
            break;
        case GLTFComponentType.UNSIGNED_INT:
            componentSize = 4;
            break;
        case GLTFComponentType.FLOAT:
            componentSize = 4;
            break;
        case GLTFComponentType.DOUBLE:
            componentSize = 8;
            break;
        default:
            throw Error("Unrecognized GLTF Component Type?");
    }
    return gltfTypeNumComponents(type) * componentSize;
}

export class GLTFBuffer {
    buffer: Uint8Array;
    constructor(buffer: ArrayBufferLike, offset: number | undefined, size: number | undefined) {
        this.buffer = new Uint8Array(buffer, offset, size);
    }
}

export class GLTFBufferView {
    length: number;
    byteStride: number;
    view: Uint8Array;
    needsUpload: boolean;
    gpuBuffer: GPUBuffer | null;
    usage: number;

    constructor(buffer: GLTFBuffer, view: { [x: string]: number; }) {
        this.length = view["byteLength"];
        this.byteStride = 0;
        if (view["byteStride"] !== undefined) {
            this.byteStride = view["byteStride"];
        }
        // Create the buffer view. Note that subarray creates a new typed
        // view over the same array buffer, we do not make a copy here.
        let viewOffset = 0;
        if (view["byteOffset"] !== undefined) {
            viewOffset = view["byteOffset"];
        }
        this.view = buffer.buffer.subarray(viewOffset, viewOffset + this.length);

        this.needsUpload = false;
        this.gpuBuffer = null
        this.usage = 0;
    }

    addUsage(usage: number) { //GPUBufferUsage
        this.usage = this.usage | usage;
    }

    upload(device : GPUDevice) {
        // Note: must align to 4 byte size when mapped at creation is true
        let buf = device.createBuffer({
            size: alignTo(this.view.byteLength, 4),
            usage: this.usage,
            mappedAtCreation: true
        });
        new Uint8Array(buf.getMappedRange()).set(this.view)
        buf.unmap();
        this.gpuBuffer = buf;
        this.needsUpload = false;
    }
}

export class GLTFAccessor {
    count: number;
    componentType: GLTFComponentType;
    gltfType: GLTFType;
    view: GLTFBufferView;
    byteOffset: number;
    constructor(view: GLTFBufferView, accessor: { [x: string]: any; }) {
        this.count = accessor["count"];
        this.componentType = accessor["componentType"];
        this.gltfType = parseGltfType(accessor["type"]);
        this.view = view;
        this.byteOffset = 0;
        if (accessor["byteOffset"] !== undefined) {
            this.byteOffset = accessor["byteOffset"];
        }
    }

    get byteStride() : number {
        let elementSize = gltfTypeSize(this.componentType, this.gltfType);
        return Math.max(elementSize, this.view.byteStride);
    }

    get byteLength() : number {
        return this.count * this.byteStride;
    }

    // Get the vertex attribute type for accessors that are used as vertex attributes
    get vertexType() : string {
        return gltfVertexType(this.componentType, this.gltfType);
    }
}

export class GLTFTexture {
    name: string;
    gpuTexture?: GPUTexture;

    constructor(name: string) {
        this.name = name
    }

    async load(device: GPUDevice) {
        // Fetch the image and upload it into a GPUTexture.
        console.log(`this.name = ${this.name}`);
        const response = await fetch(
            //TODO0: get this working with assets and glb blobs
            //new URL(this.name, import.meta.url).toString()
            new URL('texture.png', import.meta.url).toString()
        );
        const imageBitmap = await createImageBitmap(await response.blob());

        this.gpuTexture = device.createTexture({
            size: [imageBitmap.width, imageBitmap.height, 1],
            format: 'rgba8unorm',
            usage:
                GPUTextureUsage.TEXTURE_BINDING |
                GPUTextureUsage.COPY_DST |
                GPUTextureUsage.RENDER_ATTACHMENT,
        });
        device.queue.copyExternalImageToTexture(
            { source: imageBitmap },
            { texture: this.gpuTexture },
            [imageBitmap.width, imageBitmap.height]
        );
    }
}

export class GLTFMaterial {
    baseColorTexture: GLTFTexture;

    constructor(name: string) {
        this.baseColorTexture = new GLTFTexture(name);
    }

    async load(device: GPUDevice) {
        await this.baseColorTexture.load(device);
    }
}

export class GLTFPrimitive {
    positions: GLTFAccessor;
    normals: GLTFAccessor;
    UVs: GLTFAccessor;
    indices: GLTFAccessor;
    topology: GLTFRenderMode;
    renderPipeline: GPURenderPipeline|null;
    material: GLTFMaterial|null;

    constructor(positions: GLTFAccessor,
                normals: GLTFAccessor,
                UVs: GLTFAccessor,
                indices: GLTFAccessor,
                topology: GLTFRenderMode) {
        this.positions = positions;
        this.normals = normals;
        this.UVs = UVs;
        this.indices = indices;
        this.topology = topology;
        this.renderPipeline = null;
        this.material = new GLTFMaterial('texture.png')

        this.positions.view.needsUpload = true;
        this.positions.view.addUsage(GPUBufferUsage.VERTEX);

        this.normals.view.needsUpload = true;
        this.normals.view.addUsage(GPUBufferUsage.VERTEX);

        this.UVs.view.needsUpload = true;
        this.UVs.view.addUsage(GPUBufferUsage.VERTEX);

        this.indices.view.needsUpload = true;
        this.indices.view.addUsage(GPUBufferUsage.INDEX);
    }

    buildRenderPipelinePrim(device: GPUDevice,
                        shaderModule: GPUShaderModule,
                        colorFormat: GPUTextureFormat,
                        depthFormat: GPUTextureFormat,
                        uniformsBGLayout: GPUBindGroupLayout,
                        nodeParamsBGLayout: GPUBindGroupLayout) {

        // TODO0: enable
        //if (this.material) {
        //    await this.material.load(device);
        //}

        // Note: We do not pass the positions.byteOffset here, as its
        // meaning can vary in different glB files, i.e., if it's being used
        // for an interleaved element offset or an absolute offset.
        //
        // Setting the offset here for the attribute requires it to be <= byteStride,
        // as would be the case for an interleaved vertex buffer.
        let positionsAttribDesc : GPUVertexAttribute = {
            format: <GPUVertexFormat>(this.positions.vertexType),
            offset: 0,
            shaderLocation: 0,
        };
        let normalsAttribDesc : GPUVertexAttribute = {
            format: <GPUVertexFormat>(this.normals.vertexType),
            offset: 0,
            shaderLocation: 1
        };
        let UVsAttribDesc : GPUVertexAttribute = {
            format: <GPUVertexFormat>(this.UVs.vertexType),
            offset: 0,
            shaderLocation: 2
        };

        // Vertex buffer info
        const positionsBufferDesc: GPUVertexBufferLayout = {
            attributes: [positionsAttribDesc],
            arrayStride: this.positions.byteStride,
        };
        const normalsBufferDesc: GPUVertexBufferLayout = {
            attributes: [normalsAttribDesc],
            arrayStride: this.normals.byteStride,
        };
        const UVsBufferDesc: GPUVertexBufferLayout = {
            attributes: [UVsAttribDesc],
            arrayStride: this.UVs.byteStride,
        };

        // Vertex attribute state and shader stage
        let vertexState : GPUVertexState = {
            // Shader stage info
            module: shaderModule,
            entryPoint: "vertex_main",
            buffers: [positionsBufferDesc, normalsBufferDesc, UVsBufferDesc],
        };

        let fragmentState = {
            // Shader info
            module: shaderModule,
            entryPoint: "fragment_main",
            // Output render target info
            targets: [{format: colorFormat}]
        };

        // Our loader only supports triangle lists and strips, so by default we set
        // the primitive topology to triangle list, and check if it's instead a triangle strip
        let primitive : GPUPrimitiveState = {}
        if (this.topology == GLTFRenderMode.TRIANGLES) {
            primitive.topology = "triangle-list"
        }
        else if (this.topology == GLTFRenderMode.TRIANGLE_STRIP) {
            primitive.topology = "triangle-strip";
            primitive.stripIndexFormat = <GPUIndexFormat>(this.indices.vertexType);
        }
        else
        {
            throw Error(`Unsupported glTF topology ${this.topology}`);
        }

        let layout = device.createPipelineLayout({bindGroupLayouts: [uniformsBGLayout, nodeParamsBGLayout]});

        let renderPipelineDescriptor : GPURenderPipelineDescriptor = {
            layout: layout,
            vertex: vertexState,
            fragment: fragmentState,
            primitive: primitive,
            depthStencil: {format: depthFormat, depthWriteEnabled: true, depthCompare: "less"}
        };
        this.renderPipeline = device.createRenderPipeline(renderPipelineDescriptor);
    }

    render(renderPassEncoder: GPURenderPassEncoder) {
        if (this.renderPipeline != null)
            renderPassEncoder.setPipeline(this.renderPipeline);

        // Apply the accessor's byteOffset here to handle both global and interleaved
        // offsets for the buffer. Setting the offset here allows handling both cases,
        // with the downside that we must repeatedly bind the same buffer at different
        // offsets if we're dealing with interleaved attributes.
        // Since we only handle positions at the moment, this isn't a problem.
        renderPassEncoder.setVertexBuffer(0,
            this.positions.view.gpuBuffer,
            this.positions.byteOffset,
            this.positions.byteLength);
        renderPassEncoder.setVertexBuffer(1,
            this.normals.view.gpuBuffer,
            this.normals.byteOffset,
            this.normals.byteLength);
        renderPassEncoder.setVertexBuffer(2,
            this.UVs.view.gpuBuffer,
            this.UVs.byteOffset,
            this.UVs.byteLength);

        if (this.indices && this.indices.view.gpuBuffer) {
            renderPassEncoder.setIndexBuffer(this.indices.view.gpuBuffer,
                <GPUIndexFormat>this.indices.vertexType,
                this.indices.byteOffset,
                this.indices.byteLength);
            renderPassEncoder.drawIndexed(this.indices.count);
        } else {
            renderPassEncoder.draw(this.positions.count);
        }
    }
}

export class GLTFMesh {
    name: string;
    primitives: GLTFPrimitive[];
    constructor(name: string, primitives: GLTFPrimitive[]) {
        this.name = name;
        this.primitives = primitives;
    }

    buildRenderPipelineMesh(device : GPUDevice,
        shaderModule : GPUShaderModule,
        colorFormat : GPUTextureFormat,
        depthFormat : GPUTextureFormat,
        uniformsBGLayout : GPUBindGroupLayout,
        nodeParamsBGLayout : GPUBindGroupLayout) {
        // We take a pretty simple approach to start. Just loop through all the primitives and
        // build their respective render pipelines
        for (let i = 0; i < this.primitives.length; ++i) {
            this.primitives[i].buildRenderPipelinePrim(device,
                shaderModule,
                colorFormat,
                depthFormat,
                uniformsBGLayout,
                nodeParamsBGLayout);
        }
    }

    render(renderPassEncoder : GPURenderPassEncoder) {
        // We take a pretty simple approach to start. Just loop through all the primitives and
        // call their individual draw methods
        for (let i = 0; i < this.primitives.length; ++i) {
            this.primitives[i].render(renderPassEncoder);
        }
    }
}

export class GLTFNode {
    name: string;
    transform: mat4;
    mesh: GLTFMesh;
    nodeParamsBuf: GPUBuffer;
    nodeParamsBG: GPUBindGroup;
    constructor(name: string, transform: mat4, mesh: GLTFMesh) {
        this.name = name;
        this.transform = transform;
        this.mesh = mesh;
    }

    async buildRenderPipelineNode(device : GPUDevice,
                        shaderModule : GPUShaderModule,
                        colorFormat : GPUTextureFormat,
                        depthFormat : GPUTextureFormat,
                        uniformsBGLayout : GPUBindGroupLayout) {

        // Upload the node transform
        this.nodeParamsBuf = device.createBuffer({
            size: 16 * 4,
            usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
            mappedAtCreation: true
        });
        new Float32Array(this.nodeParamsBuf.getMappedRange()).set(this.transform)
        this.nodeParamsBuf.unmap();

        const linearSampler : GPUSampler = device.createSampler({
            magFilter: 'linear',
            minFilter: 'linear',
            addressModeU: 'repeat',
            addressModeV: 'repeat',
        });

        // TODO0: get texture from the mesh, don't re-create
        // let textureView : GPUTextureView|null = null;
        // if (this.mesh != null
        //     && this.mesh.primitives.length > 0
        //     && this.mesh.primitives[0].material != null
        //     && this.mesh.primitives[0].material.baseColorTexture.gpuTexture != null)
        // {
        //     textureView = this.mesh.primitives[0].material.baseColorTexture.gpuTexture.createView();
        // }
        let baseColorTexture = new GLTFTexture('texture.png');
        await baseColorTexture.load(device);
        if (baseColorTexture.gpuTexture == null)
            throw Error('texture load error!');
        let textureView : GPUTextureView = baseColorTexture.gpuTexture.createView();

        let BGLentries : GPUBindGroupLayoutEntry[] = [
            //GPUShaderStage.VERTEX
            {
                binding: 0,
                visibility: GPUShaderStage.VERTEX,
                buffer: {type: "uniform"}
            },

            //GPUShaderStage.FRAGMENT
            {
                binding: 1,
                visibility: GPUShaderStage.FRAGMENT,
                texture: {sampleType: "float", multisampled: false}
            },
            {
                binding: 2,
                visibility: GPUShaderStage.FRAGMENT,
                sampler: {type: "filtering"},
            },
        ];
        let bindGroupLayout = device.createBindGroupLayout({
            entries: BGLentries
        });

        this.nodeParamsBG = device.createBindGroup({
            layout: bindGroupLayout,
            entries: [
                {binding: 0, resource: {buffer: this.nodeParamsBuf}},
                {binding: 1, resource: textureView},
                {binding: 2, resource: linearSampler},
            ]
        });

        this.mesh.buildRenderPipelineMesh(device,
            shaderModule,
            colorFormat,
            depthFormat,
            uniformsBGLayout,
            bindGroupLayout);
    }

    render(renderPassEncoder : GPURenderPassEncoder) {
        renderPassEncoder.setBindGroup(1, this.nodeParamsBG);
        this.mesh.render(renderPassEncoder);
    }
}

export class GLTFScene {
    nodes: GLTFNode[];
    constructor(nodes: GLTFNode[]) {
        this.nodes = nodes;
    }

    async buildRenderPipeline(device : GPUDevice, shaderModule : GPUShaderModule,
        colorFormat : GPUTextureFormat, depthFormat : GPUTextureFormat, uniformsBGLayout : GPUBindGroupLayout) {
        for (let i = 0; i < this.nodes.length; ++i) {
            await this.nodes[i].buildRenderPipelineNode(device, shaderModule, colorFormat, depthFormat, uniformsBGLayout);
        }
    }

    render(renderPassEncoder : GPURenderPassEncoder, uniformsBG : GPUBindGroup) {
        renderPassEncoder.setBindGroup(0, uniformsBG);
        for (let i = 0; i < this.nodes.length; ++i) {
            this.nodes[i].render(renderPassEncoder);
        }
    }
}

// Flatten the glTF node tree passed to a single-level so that we don't have to worry
// about nested transforms in the renderer. The root node is included in the flattened tree
function flattenTree(allNodes : [any], node : any, parent_transform : mat4 | null) : any[] {

    let flattened = [];
    let tfm = readNodeTransform(node);
    if (parent_transform != undefined)
        mat4.mul(tfm, parent_transform, tfm);

    // Add the flattened current node
    let n = {
        matrix: tfm,
        mesh: node["mesh"]
    };
    flattened.push(n);

    // Loop through the node's children and flatten them as well
    if (node["children"]) {
        for (let i = 0; i < node["children"].length; ++i) {
            flattened.push(...flattenTree(allNodes, allNodes[node["children"][i]], tfm));
        }
    }
    return flattened;
}

function readNodeTransform(node : any) {
    if (node["matrix"]) {
        let m = node["matrix"];
        // Both glTF and gl matrix are column major
        return mat4.fromValues(m[0],
            m[1],
            m[2],
            m[3],
            m[4],
            m[5],
            m[6],
            m[7],
            m[8],
            m[9],
            m[10],
            m[11],
            m[12],
            m[13],
            m[14],
            m[15]);
    } else {
        let scale : [number, number, number] = [1, 1, 1];
        let rotation : [number, number, number, number] = [0, 0, 0, 1];
        let translation : [number, number, number] = [0, 0, 0];
        if (node["scale"]) {
            scale = node["scale"];
        }
        if (node["rotation"]) {
            rotation = node["rotation"];
        }
        if (node["translation"]) {
            translation = node["translation"];
        }
        let m = mat4.create();
        return mat4.fromRotationTranslationScale(m, rotation, translation, scale);
    }
}

// Upload a GLB model and return it
export function uploadGLB(buffer: ArrayBuffer, device: GPUDevice) {
    let loadingText : any = document.getElementById("loading-text")
    loadingText.hidden = false;
    // glB has a JSON chunk and a binary chunk, potentially followed by
    // other chunks specifying extension specific data, which we ignore
    // since we don't support any extensions.
    // Read the glB header and the JSON chunk header together
    // glB header:
    // - magic: u32 (expect: 0x46546C67)
    // - version: u32 (expect: 2)
    // - length: u32 (size of the entire file, in bytes)
    // JSON chunk header
    // - chunkLength: u32 (size of the chunk, in bytes)
    // - chunkType: u32 (expect: 0x4E4F534A for the JSON chunk)
    let header = new Uint32Array(buffer, 0, 5);
    if (header[0] != 0x46546C67) {
        throw Error("Provided file is not a glB file")
    }
    if (header[1] != 2) {
        throw Error("Provided file is glTF 2.0 file");
    }
    if (header[4] != 0x4E4F534A) {
        throw Error("Invalid glB: The first chunk of the glB file is not a JSON chunk!");
    }

    // Parse the JSON chunk of the glB file to a JSON object
    let jsonChunk =
        JSON.parse(new TextDecoder("utf-8").decode(new Uint8Array(buffer, 20, header[3])));

    // Read the binary chunk header
    // - chunkLength: u32 (size of the chunk, in bytes)
    // - chunkType: u32 (expect: 0x46546C67 for the binary chunk)
    let binaryHeader = new Uint32Array(buffer, 20 + header[3], 2);
    if (binaryHeader[1] != 0x004E4942) {
        throw Error("Invalid glB: The second chunk of the glB file is not a binary chunk!");
    }
    // Make a GLTFBuffer that is a view of the entire binary chunk's data,
    // we'll use this to create buffer views within the chunk for memory referenced
    // by objects in the glTF scene
    let binaryChunk = new GLTFBuffer(buffer, 28 + header[3], binaryHeader[0]);

    // Create GLTFBufferView objects for all the buffer views in the glTF file
    let bufferViews = [];
    for (let i = 0; i < jsonChunk.bufferViews.length; ++i) {
        bufferViews.push(new GLTFBufferView(binaryChunk, jsonChunk.bufferViews[i]));
    }

    // Create GLTFAccessor objects for the accessors in the glTF file
    // We need to handle possible errors being thrown here if a model is using
    // accessors for types we don't support yet. For example, a model with animation
    // may have a MAT4 accessor, which we currently don't support.
    let accessors = [];
    for (let i = 0; i < jsonChunk.accessors.length; ++i) {
        let accessorInfo = jsonChunk.accessors[i];
        let viewID = accessorInfo["bufferView"];
        accessors.push(new GLTFAccessor(bufferViews[viewID], accessorInfo));
    }

    // Load all the meshes
    let meshes = [];
    console.log(`glTF file has ${jsonChunk.meshes.length} meshes`);
    for (let j = 0; j < jsonChunk.meshes.length; ++j) {
        let mesh = jsonChunk.meshes[j];
        let meshPrimitives : GLTFPrimitive[] = [];
        for (let i = 0; i < mesh.primitives.length; ++i) {
            let prim = mesh.primitives[i];
            let topology = prim["mode"];
            // Default is triangles if mode specified
            if (topology === undefined) {
                topology = GLTFRenderMode.TRIANGLES;
            }
            if (topology != GLTFRenderMode.TRIANGLES &&
                topology != GLTFRenderMode.TRIANGLE_STRIP) {
                throw Error(`Unsupported primitive mode ${prim["mode"]}`);
            }

            let indices : GLTFAccessor|null = null;
            if (jsonChunk["accessors"][prim["indices"]] !== undefined) {
                indices = accessors[prim["indices"]];
            }

            // Loop through all the attributes to find the POSITION attribute.
            // While we only want the position attribute right now, we'll load
            // the others later as well.
            let positions : GLTFAccessor|null = null
            let normals : GLTFAccessor|null = null
            let UVs : GLTFAccessor|null = null
            for (let attr in prim["attributes"]) {
                let accessor = accessors[prim["attributes"][attr]];
                if (attr == "POSITION") {
                    positions = accessor;
                }
                else if (attr == "NORMAL") {
                    normals = accessor;
                }
                else if (attr == "TEXCOORD_0") {
                    UVs = accessor;
                }
            }

            // Add the primitive to the mesh's list of primitives
            if (positions != null && normals != null && UVs != null && indices != null)
                meshPrimitives.push(new GLTFPrimitive(positions, normals, UVs, indices, topology));
        }

        if (meshPrimitives.length > 0)
            meshes.push(new GLTFMesh(mesh["name"], meshPrimitives));
    }

    // Upload the buffer views used by mesh
    for (let i = 0; i < bufferViews.length; ++i) {
        if (bufferViews[i].needsUpload) {
            bufferViews[i].upload(device);
        }
    }

    // Build the default GLTFScene, we just take all the mesh nodes for now
    let defaultSceneNodes = jsonChunk["scenes"][0]["nodes"];
    // If we have a default scene, load it, otherwise we use the first scene
    if (jsonChunk["scenes"]) {
        defaultSceneNodes = jsonChunk["scenes"][jsonChunk["scene"]]["nodes"];
    }
    let defaultNodes = [];
    for (let i = 0; i < defaultSceneNodes.length; ++i) {
        // Get each node referenced by the scene and flatten it and its children
        // out to a single-level scene so that we don't need to keep track of nested
        // transforms in the renderer
        // TODO: We'll need to put a bit more thought here when we start handling animated nodes
        // in the hierarchy. For now this is fine.
        let allNodes = jsonChunk["nodes"]
        let n = allNodes[defaultSceneNodes[i]];
        let flattenedNodes = flattenTree(allNodes, n, null);

        // Add all the mesh nodes in the flattened node list to the scene's default nodes
        for (let j = 0; j < flattenedNodes.length; ++j) {
            let fn = flattenedNodes[j];
            if (fn["mesh"] != undefined) {
                defaultNodes.push(new GLTFNode(n["name"], fn["matrix"], meshes[fn["mesh"]]));
            }
        }
    }

    loadingText.hidden = true;

    return new GLTFScene(defaultNodes);
}

