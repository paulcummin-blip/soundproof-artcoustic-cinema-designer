// useStagingUpdateClassification.js
// Loads the live Speaker Database and diffs the staging workbook against it.

import { useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { STAGING_MODELS, STAGING_BRANDS_WITHOUT_MODELS } from "./stagingWorkbookData";
import { classifyStagingUpdate } from "./classifyStagingUpdate";

const asArray = (value) => (Array.isArray(value) ? value : value?.items || []);

export function useStagingUpdateClassification() {
  const [state, setState] = useState({ loading: true, error: "", classification: null });

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const [manufacturers, products] = await Promise.all([
          base44.entities.SpeakerManufacturer.list({}, { sort: "name", limit: 500 }),
          base44.entities.SpeakerProduct.list({}, { sort: "manufacturer_name", limit: 500 }),
        ]);
        if (cancelled) return;
        const classification = classifyStagingUpdate({
          workbook: { models: STAGING_MODELS, brandsWithoutModels: STAGING_BRANDS_WITHOUT_MODELS },
          existing: {
            manufacturers: asArray(manufacturers),
            products: asArray(products),
          },
        });
        if (!cancelled) setState({ loading: false, error: "", classification });
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: e?.message || "Could not load the speaker database.", classification: null });
      }
    })();
    return () => { cancelled = true; };
  }, []);

  return state;
}