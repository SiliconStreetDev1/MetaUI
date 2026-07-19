/**
 * @file LayoutRegistry.ts
 * @description Centralized registry for all available layout managers (e.g. Form, Table, Wizard).
 */
import { Registry } from "./Registry";
import { ILayoutManager } from "../interfaces/ILayoutManager";
import { FormLayout } from "../layouts/FormLayout";
import { TableLayout } from "../layouts/TableLayout";
import { WizardLayout } from "../layouts/WizardLayout";
import { Engine } from "./Engine";

/** 
 * The globally exposed registry containing instantiations of the layout strategies.
 * It is injected directly into the Engine to avoid circular dependencies.
 * 
 * @public
 */
export const LayoutRegistry = new Registry<ILayoutManager>("Layouts");

LayoutRegistry.register("form", new FormLayout());
LayoutRegistry.register("table", new TableLayout());
LayoutRegistry.register("wizard", new WizardLayout());

Engine.layoutRegistry = LayoutRegistry;
