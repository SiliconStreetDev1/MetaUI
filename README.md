# MetaUI

**MetaUI** is an extensible, metadata-driven UI engine built on top of SAP UI5. Instead of relying on static XML views, it parses standard JSON Schema definitions at runtime to dynamically generate SAP Fiori component trees. This enables server-driven architectures where the UI structure and data bindings are determined entirely by the incoming payload.

## MetaUI vs. Fiori Elements
It is important to note that MetaUI is **not** an attempt to replace SAP Fiori Elements. Fiori Elements is a robust framework for building UIs driven by static OData CDS annotations. 

MetaUI is designed for highly dynamic use cases where CDS annotations are unavailable, impossible, or too rigid. By relying on universal JSON, MetaUI provides a flexible alternative for scenarios that demand on-the-fly layout generation.

✨ **[Play with the Live Interactive Demo Here!](https://SiliconStreetDev1.github.io/MetaUI/index.html)** ✨

---

## 📚 Documentation

All comprehensive documentation regarding JSON Schema properties, `ui.*` orchestrations, plugins, and Fiori integrations has been moved to our Wiki. 

Please refer to the **[MetaUI Documentation Wiki](docs/wiki/Home.md)** for full implementation details, API references, and integration guides.

---

## ⚖️ License & Disclaimer

**MIT License**

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

> [!WARNING]
> **Disclaimer**: This software is provided "as is", without warranty of any kind, express or implied. Use of this project in production environments is at your own risk. The authors shall not be liable for any damages or issues arising from its usage.
