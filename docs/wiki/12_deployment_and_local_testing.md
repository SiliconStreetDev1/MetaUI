# Deployment and Local Testing

This guide explains how to consume the MetaUI library from an NPM package, test it locally in your Fiori applications, and deploy it as a standalone library to an SAP ABAP backend.

---

## 1. Local Testing with Fiori Apps

When consuming MetaUI from NPM, you **do not** want to copy the library files into your app's `webapp/resources` or `dest` folder. Doing so will accidentally bundle the library directly into your app's deployment package. 

Instead, you use the `ui5-middleware-servestatic` plugin to trick the local UI5 server into serving the library directly from your `node_modules` folder during development.

### Step 1: Install Dependencies
Run the following commands in the root of your Fiori application:

```bash
npm install nz.co.siliconst.ui5.metaui
npm install --save-dev ui5-middleware-servestatic
```

### Step 2: Configure `package.json`
You must declare the library as a `devDependency` to prevent standard UI5 build tasks (like `ui5 build --all`) from bundling it into your app's `dist` folder. You must also register the middleware in the `ui5` block so the tooling recognizes it.

```json
{
  "devDependencies": {
    "nz.co.siliconst.ui5.metaui": "^1.4.9",
    "ui5-middleware-servestatic": "^3.0.0"
  },
  "ui5": {
    "dependencies": [
      "ui5-middleware-servestatic"
    ]
  }
}
```

### Step 3: Configure `ui5.yaml`
Add the middleware to your app's `ui5.yaml` file to map the namespace requested by the browser directly to the built files in the NPM package:

```yaml
server:
  customMiddleware:
    - name: ui5-middleware-servestatic
      afterMiddleware: compression
      mountPath: /resources/nz/co/siliconst/ui5/metaui
      configuration:
        rootPath: "./node_modules/nz.co.siliconst.ui5.metaui/dist/resources/nz/co/siliconst/ui5/metaui"
```

Now, when you run `npm start` (or `ui5 serve`), your local browser will resolve `<meta:DynamicHost>` by reading the library directly from your laptop's `node_modules` directory. When you deploy your app, the `dist` folder remains clean.

---

## 2. Deploying the Library to SAP ABAP

Once your local testing is complete, you need to deploy the standalone MetaUI library to the SAP backend so that all deployed Fiori apps can consume it at runtime.

Because the published NPM package (`@siliconst/metaui`) is published using a custom script (`publish-prep.js`), it actually contains the fully built, transpiled Javascript files. During the publish step, the build output is renamed to the `src` folder. 

This means you **can** deploy it directly from your `node_modules` without needing to rebuild it.

### Step 1: Install the Standalone CLI
Install the community deployer tool globally on your machine:
```bash
npm install -g ui5-nwabap-deployer-cli
```

### Step 2: Create a Configuration File
In the folder where you installed the NPM package, create a file named `.ui5deployrc`. Configure it to point to the `src` folder inside the node module.

```json
{
  "cwd": "./node_modules/@siliconst/metaui/src",
  "server": "https://your-sap-server.com:443",
  "client": "100",
  "package": "Z_YOUR_ABAP_PACKAGE", 
  "bspContainer": "Z_METAUI",
  "bspContainerText": "MetaUI Library",
  "transportUseLocked": true,
  "transportUseUserMatch": true,
  "createTransport": true,
  "transportText": "MetaUI Library Upload"
}
```
*(Note: If deploying locally without a transport request, change `"package"` to `"$TMP"` and omit the transport properties).*

### Step 3: Run the Deployment
Execute the deploy command, passing your credentials inline. 

```bash
ui5-deployer deploy --user your_sap_username --pwd your_sap_password
```

> [!TIP]
> **Why `src` and not `dist` or `resources`?**
> The `publish-prep.js` script takes the built `dist/resources` folder and renames it to `src` before publishing to NPM. By setting `cwd` to `src`, the deployer uploads the namespace folders directly to the root of the BSP application. This ensures the SAP UI5 App Index correctly calculates and registers the resource root at runtime.

### How it works:
1. The tool reads the `dist` folder directly from the NPM package.
2. It zips the contents and uploads them via the `/UI5/ABAP_REPOSITORY_SRV` OData API.
3. Crucially, the backend automatically triggers the `/UI5/APP_INDEX_CALCULATE` ABAP program in the background. This registers the `nz.co.siliconst.ui5.metaui` namespace in the ABAP UI5 index so that your Fiori apps can find it instantly at runtime.

---

## References & Further Reading
* [ui5-nwabap-deployer-cli Official Documentation (GitHub)](https://github.com/pfefferf/ui5-nwabap-deployer-cli)
* [nwabap-ui5uploader Configuration Options (GitHub)](https://github.com/pmueller/nwabap-ui5uploader)
* [SAP Fiori Tools: Deployment to ABAP (Official SAP Help)](https://help.sap.com/docs/SAP_FIORI_tools/17d50220bcd848aa854c9c182d65b699/7150172e259e4402a5c13e51240a233f.html)
* [UI5 Tooling: Custom Middleware `ui5-middleware-servestatic`](https://www.npmjs.com/package/ui5-middleware-servestatic)
