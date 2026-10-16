// importBatchStore.js
// ---------------------------------------------------------------------------
// Durable import batch history and the rollback that makes an import reversible.
//
// Rollback restores canonical data only, and it is deliberately conservative:
//
//   • it refuses any specification that has been published to RP22 since the
//     import — published data is evidence and is never silently rewritten;
//   • it refuses any record whose values have moved on since the import, because
//     a later edit is a deliberate decision (the check compares stored values,
//     not clocks, so it cannot be fooled by timing);
//   • it deletes only records the batch itself created, and only while they are
//     still untouched, so a rollback can never remove a record that already
//     existed and can never produce a duplicate product or specification.
//
// Every refusal is reported by name, so a partial rollback says exactly what it
// did and what it left alone.
// ---------------------------------------------------------------------------

import { base44 } from "@/api/base44Client";

function asArray(value) {
  return Array.isArray(value) ? value : value?.items || [];
}

function hasValues(object) {
  return Object.keys(object || {}).length > 0;
}

function isBlank(value) {
  return value === null || value === undefined || String(value).trim() === "";
}

function sameValue(a, b) {
  const blankA = isBlank(a);
  const blankB = isBlank(b);
  if (blankA && blankB) return true;
  if (blankA !== blankB) return false;
  return String(a).trim() === String(b).trim() || Number(a) === Number(b);
}

/** Does the stored record still carry exactly the values the batch wrote? */
function stillMatches(record, expected) {
  if (!hasValues(expected)) return true;
  return Object.entries(expected).every(([key, value]) => sameValue(record?.[key], value));
}

async function safeGet(entity, id) {
  if (!id) return null;
  try {
    return await entity.get(id);
  } catch {
    return null;
  }
}

async function safeDelete(entity, id) {
  if (!id) return false;
  try {
    await entity.delete(id);
    return true;
  } catch {
    return false;
  }
}

export async function listImportBatches(limit = 15) {
  const rows = await base44.entities.SpeakerImportBatch.list("-applied_at", limit);
  return asArray(rows);
}

/** The records the batch created for one product, so removal is never over-eager. */
async function createdSpecificationCount(entry) {
  return entry.created?.specification && entry.specification_id ? 1 : 0;
}

/**
 * Roll one applied batch back.
 * @returns {object} { restored, deleted, refused, notes }
 */
export async function rollbackImportBatch({ batch, actorName }) {
  const entries = Array.isArray(batch?.entries) ? [...batch.entries].reverse() : [];
  const refused = [];
  const notes = [];
  let restored = 0;
  let deleted = 0;

  for (const entry of entries) {
    const label = `${entry.manufacturer_name || ""} ${entry.model || ""}`.trim() || `row ${entry.row_number}`;
    const refuse = (reason) => refused.push(`${label}: ${reason}`);

    const specification = await safeGet(base44.entities.SpeakerSpecification, entry.specification_id);
    const product = await safeGet(base44.entities.SpeakerProduct, entry.product_id);

    // --- records this batch created are removed, never restored -----------
    if (entry.created?.product) {
      if (!product) {
        notes.push(`${label}: the product no longer exists — nothing to remove.`);
        continue;
      }
      const productSpecs = asArray(await base44.entities.SpeakerSpecification.filter({ product_id: entry.product_id }));
      if (productSpecs.length > await createdSpecificationCount(entry)) {
        refuse("its product has gained specifications since the import — refusing so nothing is removed that this import did not create.");
        continue;
      }
      if (specification?.rp22_published_competitor_id) {
        refuse("its specification has been published to RP22 since the import — remove it from the comparison deliberately first.");
        continue;
      }
      if (await safeDelete(base44.entities.SpeakerSpecification, entry.specification_id)) deleted += 1;
      if (await safeDelete(base44.entities.SpeakerProduct, entry.product_id)) deleted += 1;

      if (entry.created.manufacturer && entry.manufacturer_id) {
        const remaining = asArray(await base44.entities.SpeakerProduct.filter({ manufacturer_id: entry.manufacturer_id }));
        if (!remaining.length && await safeDelete(base44.entities.SpeakerManufacturer, entry.manufacturer_id)) deleted += 1;
      }
      continue;
    }

    // --- a new specification version this batch wrote ---------------------
    if (entry.created?.specification) {
      if (!specification) {
        refuse("its specification no longer exists — nothing to restore.");
      } else if (specification.rp22_published_competitor_id) {
        refuse("its specification has been published to RP22 since the import — it is now evidence and is not rewritten.");
      } else if (!stillMatches(specification, entry.after?.specification)) {
        refuse("its specification has been edited since the import — refusing so a later decision is not undone.");
      } else if (product?.current_specification_id && product.current_specification_id !== entry.specification_id) {
        refuse("the product's current specification has been changed since the import — refusing so a later decision is not undone.");
      } else {
        if (entry.previous_specification_id) {
          const previous = await safeGet(base44.entities.SpeakerSpecification, entry.previous_specification_id);
          if (previous) {
            await base44.entities.SpeakerSpecification.update(entry.previous_specification_id, {
              is_current: entry.before?.previousSpecification?.is_current !== false,
              ...(entry.before?.previousSpecification?.approval_status
                ? { approval_status: entry.before.previousSpecification.approval_status }
                : {}),
            });
          }
        }
        if (product) {
          await base44.entities.SpeakerProduct.update(entry.product_id, {
            current_specification_id: entry.previous_specification_id || null,
            ...(hasValues(entry.before?.product) ? entry.before.product : {}),
          });
          restored += 1;
        }
        if (await safeDelete(base44.entities.SpeakerSpecification, entry.specification_id)) deleted += 1;
      }
    } else if (entry.specification_id && hasValues(entry.before?.specification)) {
      // --- an in-place update of a draft specification --------------------
      if (!specification) {
        refuse("its specification no longer exists — nothing to restore.");
      } else if (specification.rp22_published_competitor_id) {
        refuse("its specification has been published to RP22 since the import — it is now evidence and is not rewritten.");
      } else if (!stillMatches(specification, entry.after?.specification)) {
        refuse("its specification has been edited since the import — refusing so a later decision is not undone.");
      } else {
        await base44.entities.SpeakerSpecification.update(entry.specification_id, entry.before.specification);
        restored += 1;
      }
    }

    // --- product fields this batch wrote ----------------------------------
    if (entry.product_id && hasValues(entry.before?.product)) {
      if (!product) {
        refuse("its product no longer exists — nothing to restore.");
      } else if (!stillMatches(product, entry.after?.product)) {
        refuse("its product has been edited since the import — refusing so a later decision is not undone.");
      } else {
        await base44.entities.SpeakerProduct.update(entry.product_id, entry.before.product);
        restored += 1;
      }
    }

    // --- a renamed manufacturer is restored, with its products ------------
    if (entry.renamed_manufacturer?.id) {
      await base44.entities.SpeakerManufacturer.update(entry.renamed_manufacturer.id, {
        name: entry.renamed_manufacturer.from,
      });
      await base44.entities.SpeakerProduct.updateMany(
        { manufacturer_id: entry.renamed_manufacturer.id },
        { $set: { manufacturer_name: entry.renamed_manufacturer.from } },
      );
      restored += 1;
      notes.push(`${label}: manufacturer name restored to “${entry.renamed_manufacturer.from}”.`);
    }
  }

  const rollbackNotes = [
    `${restored} record(s) restored, ${deleted} record(s) created by the import removed.`,
    refused.length ? `${refused.length} record(s) left alone.` : "",
    ...refused,
    ...notes,
  ].filter(Boolean).join(" ");

  await base44.entities.SpeakerImportBatch.update(batch.id, {
    status: "rolled_back",
    rolled_back_at: new Date().toISOString(),
    rolled_back_by: actorName || "Admin",
    rollback_notes: rollbackNotes,
  });

  return { restored, deleted, refused, notes: rollbackNotes };
}