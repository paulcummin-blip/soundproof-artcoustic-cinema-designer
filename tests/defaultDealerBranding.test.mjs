import test from "node:test";
import assert from "node:assert/strict";
import React from "react";
import { act, create } from "react-test-renderer";
import { APPROVED_DEALER_BRANDING as defaults, resolveDealerBrandPresentation, safeBrandImageUrl } from "../src/components/account/defaultDealerBranding.js";
import { useBrandImage } from "../src/components/account/useBrandImage.js";

test("new dealer inherits complete approved defaults without a data write", () => {
  const p = resolveDealerBrandPresentation(null, "dealer-a");
  assert.equal(p.heroBg, defaults.hero_background_url);
  assert.equal(p.dealerLogo, defaults.white_logo_url);
  assert.equal(p.dealerName, "Artcoustic");
  assert.equal(p.hasCustomHero, false);
  assert.equal(p.hasCustomLogo, false);
  assert.equal(defaults.heading, "PROFESSIONAL HOME CINEMA ENGINEERING");
  assert.equal(defaults.subheading, "POWERED BY ARTCOUSTIC DESIGN INTELLIGENCE (ADI)");
});
test("partial customisations use dealer colour logo, not default white logo", () => {
  const raw = { account_id: "dealer-a", dealer_logo_url: "https://example.com/a.png", company_name: "Dealer A" };
  const before = JSON.stringify(raw);
  const p = resolveDealerBrandPresentation(raw, "dealer-a");
  assert.equal(p.dealerLogo, raw.dealer_logo_url);
  assert.equal(p.heroBg, defaults.hero_background_url);
  assert.equal(p.dealerName, "Dealer A");
  assert.equal(JSON.stringify(raw), before);
});
test("custom hero and reversed logo override only that dealer", () => {
  const raw = {account_id:"dealer-a",hero_background_url:"https://example.com/a.jpg",white_logo_url:"https://example.com/white.png"};
  const p = resolveDealerBrandPresentation(raw, "dealer-a");
  assert.equal(p.heroBg, raw.hero_background_url);
  assert.equal(p.dealerLogo, raw.white_logo_url);
  assert.equal(resolveDealerBrandPresentation(raw, "dealer-b").heroBg, defaults.hero_background_url);
  assert.equal(resolveDealerBrandPresentation(raw, "dealer-b").dealerLogo, defaults.white_logo_url);
  assert.ok(Object.isFrozen(defaults));
});
test("cleared or invalid uploads restore defaults without generic/blank art", () => {
  const p = resolveDealerBrandPresentation({account_id:"dealer-a",hero_background_url:null,white_logo_url:"",dealer_logo_url:"javascript:alert(1)"}, "dealer-a");
  assert.equal(p.heroBg, defaults.hero_background_url);
  assert.equal(p.dealerLogo, defaults.white_logo_url);
  for (const url of [null, "", "/relative", "http://example.com/a.png", "https://user:pass@example.com/a.png", "data:image/png;base64,aaa"]) assert.equal(safeBrandImageUrl(url), null);
});
test("loading, failed uploads and account switches never show stale/broken custom art", () => {
  const originalImage = globalThis.Image;
  const images = [];
  globalThis.Image = class { constructor(){images.push(this);} };
  let rendered;
  function Probe({candidate}) { return React.createElement("div", {"data-image":useBrandImage(candidate, defaults.hero_background_url)}); }
  try {
    act(()=>{rendered=create(React.createElement(Probe,{candidate:"https://example.com/a.jpg"}));});
    assert.equal(rendered.toJSON().props["data-image"], defaults.hero_background_url);
    const staleLoad = images[0].onload;
    act(()=>{rendered.update(React.createElement(Probe,{candidate:"https://example.com/b.jpg"}));});
    act(()=>{staleLoad();});
    assert.equal(rendered.toJSON().props["data-image"], defaults.hero_background_url);
    act(()=>{images[1].onerror();});
    assert.equal(rendered.toJSON().props["data-image"], defaults.hero_background_url);
    act(()=>{rendered.update(React.createElement(Probe,{candidate:"https://example.com/c.jpg"}));});
    act(()=>{images[2].onload();});
    assert.equal(rendered.toJSON().props["data-image"], "https://example.com/c.jpg");
    act(()=>{rendered.update(React.createElement(Probe,{candidate:defaults.hero_background_url}));});
    assert.equal(rendered.toJSON().props["data-image"], defaults.hero_background_url);
  } finally { act(()=>rendered?.unmount()); globalThis.Image=originalImage; }
});
