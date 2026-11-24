"use client";

import { useState } from "react";
import { ArrowUpRight, Download, Search } from "lucide-react";
import { downloadExcel } from "./excel-export";
import SourceNav from "./source-nav";
import {
  fdaStandardsDatabase,
  mappings,
  products,
  standards,
  type ProductKey,
  type StandardKey,
} from "./standards-mapping-data";
import "./standards-mapping.css";

const productOptions = Object.keys(products) as ProductKey[];
const standardOptions = Object.keys(standards) as StandardKey[];
const clauseOrder = new Intl.Collator("en", { numeric: true });
const sortedStandardOptions = [...standardOptions].sort((left, right) => clauseOrder.compare(standards[left].name, standards[right].name));

const catalog = standardOptions.map((key) => ({
  key,
  reference: standards[key],
  rows: mappings.filter((row) => row.standard === key).sort((left, right) => clauseOrder.compare(left.clause, right.clause)),
}));

export default function StandardsMappingPage() {
  const [query, setQuery] = useState("");
  const [product, setProduct] = useState<ProductKey | "">("");
  const [standard, setStandard] = useState<StandardKey | "">("");
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  const groups = catalog
    .filter(({ key }) => !standard || key === standard)
    .map(({ key, reference, rows }) => ({
      key,
      reference,
      rows: rows.filter((row) => {
        if (product && !row.products.includes(product)) return false;
        const searchText = [
          row.id, reference.name, reference.topic, reference.fda?.number, row.clause, row.topic, row.applicability, row.requirement, row.evidence,
          ...row.products.flatMap((key) => [products[key].name, products[key].example]),
        ].join(" ").toLowerCase();
        return terms.every((term) => searchText.includes(term));
      }),
    }))
    .filter(({ rows }) => rows.length > 0);
  const visible = groups.flatMap(({ rows }) => rows);

  function resetFilters() {
    setQuery("");
    setProduct("");
    setStandard("");
  }

  function exportMappings() {
    downloadExcel({
      filename: "sonova-draft-standards-mapping",
      sheetName: "Draft mappings",
      columns: [
        { header: "Mapping ID" }, { header: "Review status" }, { header: "Standard and edition", width: 28 },
        { header: "Clause" }, { header: "Topic", width: 30 }, { header: "Product family", width: 33 },
        { header: "Applicability", width: 55 }, { header: "Draft requirement", width: 70 },
        { header: "Suggested verification evidence", width: 70 }, { header: "Publisher", type: "link" },
        { header: "FDA recognition", type: "link", width: 32 },
      ],
      rows: visible.map((row) => {
        const reference = standards[row.standard];
        return [
          row.id, "Draft example", reference.name, row.clause, row.topic, row.products.map((key) => products[key].name).join(", "),
          row.applicability, row.requirement, row.evidence, { text: reference.name, url: reference.publisher },
          reference.fda
            ? { text: `${reference.fda.number} · ${reference.fda.extent}`, url: reference.fda.url }
            : { text: "Check edition in FDA database", url: fdaStandardsDatabase },
        ];
      }),
    });
  }

  return (
    <>
      <SourceNav source="fda" view="standards" status="Reference library" />
      <main className="standards-mapping">
        <section className="standards-intro" aria-labelledby="standards-title">
          <div className="standards-intro-copy">
            <span className="standards-eyebrow">FDA / Standards</span>
            <h1 id="standards-title">Standards mapping</h1>
            <p>Trace standard clauses to draft product requirements and suggested verification evidence for Sonova product families.</p>
          </div>
          <div className="standards-note">
            <strong>Draft examples for regulatory review</strong>
            <p>Confirm each clause against the applicable edition, product configuration, and FDA recognition record. Use approved product specifications for acceptance limits.</p>
            <a href={fdaStandardsDatabase}>FDA recognized standards database <ArrowUpRight size={14} aria-hidden="true" /></a>
          </div>
        </section>

        <section aria-labelledby="matrix-title" className="standards-matrix">
          <div className="standards-matrix-heading">
            <div>
              <h2 id="matrix-title">Clause-to-requirement matrix</h2>
              <p role="status">{visible.length} of {mappings.length} mappings across {groups.length} {groups.length === 1 ? "standard" : "standards"}</p>
            </div>
            <button className="standards-action" type="button" onClick={exportMappings} disabled={!visible.length}>
              <Download size={16} aria-hidden="true" /> Export filtered rows
            </button>
          </div>
          <div className="standards-filters">
            <label>
              <span>Search mappings</span>
              <div className="standards-search">
                <Search size={16} aria-hidden="true" />
                <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Clause, requirement, or product" />
              </div>
            </label>
            <label>
              <span>Product family</span>
              <select value={product} onChange={(event) => setProduct(event.target.value as ProductKey | "")}>
                <option value="">All product families</option>
                {productOptions.map((id) => <option value={id} key={id}>{products[id].name}</option>)}
              </select>
            </label>
            <label>
              <span>Standard</span>
              <select value={standard} onChange={(event) => setStandard(event.target.value as StandardKey | "")}>
                <option value="">All standards</option>
                {sortedStandardOptions.map((id) => <option value={id} key={id}>{standards[id].name}</option>)}
              </select>
            </label>
            <button className="standards-action standards-reset" type="button" onClick={resetFilters} disabled={!query && !product && !standard}>Clear filters</button>
          </div>
          <p className="standards-product-reference">
            {product ? <><strong>Product example</strong> <a href={products[product].url}>{products[product].example}</a></> : "Select a product family to see a Sonova product example."}
          </p>
          {groups.length ? (
            <div className="standards-groups">
              {groups.map(({ key, reference, rows }) => (
                <section className="standards-group" key={key} aria-labelledby={`standard-${key}`}>
                  <header className="standards-group-heading">
                    <div>
                      <h3 id={`standard-${key}`}><a href={reference.publisher}>{reference.name}</a></h3>
                      <p>{reference.topic} · {rows.length} {rows.length === 1 ? "mapping" : "mappings"}</p>
                    </div>
                    {reference.fda ? (
                      <a className="standards-fda" href={reference.fda.url}>FDA {reference.fda.number} · {reference.fda.extent}</a>
                    ) : (
                      <a className="standards-fda" href={fdaStandardsDatabase}>Check FDA recognition for this edition</a>
                    )}
                  </header>
                  <div className="standards-table-wrap" role="region" aria-label={`${reference.name} mappings`} tabIndex={0}>
                    <table className="standards-table" aria-labelledby={`standard-${key}`}>
                      <thead>
                        <tr>
                          <th scope="col">Clause</th>
                          <th scope="col">Product applicability</th>
                          <th scope="col">Expected requirement</th>
                          <th scope="col">Verification evidence</th>
                        </tr>
                      </thead>
                      <tbody>
                        {rows.map((row) => (
                          <tr key={row.id}>
                            <th scope="row">
                              <span className="standards-clause">{/^\d/.test(row.clause) ? `§ ${row.clause}` : row.clause}</span>
                              <strong>{row.topic}</strong>
                              <small>{row.id}</small>
                            </th>
                            <td>
                              <ul className="standards-products" aria-label="Product families">
                                {row.products.map((productKey) => <li key={productKey}>{products[productKey].name}</li>)}
                              </ul>
                              {row.applicability}
                            </td>
                            <td>{row.requirement}</td>
                            <td>{row.evidence}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <div className="standards-empty">
              <strong>No mappings match these filters</strong>
              <p>Try another clause, product family, or standard.</p>
            </div>
          )}
        </section>
      </main>
    </>
  );
}
