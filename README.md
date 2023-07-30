# GLTF scene loading with WebGPU

This project is based on [WebGPU Webpack Starter](https://github.com/Twinklebear/webgpu-webpack-starter) and [From 0 to glTF with WebGPU Code](https://github.com/Twinklebear/webgpu-0-to-gltf) projects. It's mainly developed as a personal WebGPU playground and adds some extra functionality on top of the tutorials to load UVs, normals and textures from the glb files.

## Getting Started

After cloning the repo run

```
npm install
```

To install webpack, then you can run the serve task and point your browser to `localhost:8080`:

```
npm run serve
```

Where you should see the page shown below.

To deploy your application, run:

```
npm run deploy
```

Then you can copy the content of the `dist/` directory to your webserver. You can build a development
distribution by running `npm run build`.

