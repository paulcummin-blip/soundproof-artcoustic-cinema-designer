import { preparePrintDocument, describePrintReadinessFailure } from '@/components/report/printReadiness';
import { composeBrowserProposal, proposalMeasurementCss } from '@/components/proposal/export/browserProposalComposition';

/** Popup-blocked export: compose an isolated DOM copy; React's mounted pack stays intact. */
export async function prepareBrowserProposalFallback(node, registerCleanup, trace = null) {
  const doc = node.ownerDocument;
  const clone = node.cloneNode(true);
  const style = doc.createElement('style');
  style.setAttribute('data-browser-composition-style', 'true');
  style.textContent = proposalMeasurementCss(doc);
  const previousDisplay = node.style.getPropertyValue('display');
  const previousPriority = node.style.getPropertyPriority('display');
  const dispose = () => {
    clone.remove();
    style.remove();
    if (previousDisplay) node.style.setProperty('display', previousDisplay, previousPriority);
    else node.style.removeProperty('display');
  };
  registerCleanup(dispose);
  doc.head.append(style);
  node.style.setProperty('display', 'none', 'important');
  clone.style.cssText = 'display:block!important;position:absolute;left:-20000px;top:0;width:210mm;';
  doc.body.append(clone);
  const readiness = await preparePrintDocument({ doc, root: clone, trace });
  if (!readiness.ready) {
    const error = new Error(describePrintReadinessFailure(readiness));
    error.printNotReady = true;
    error.readinessDiagnostics = readiness.diagnostics;
    throw error;
  }
  // The same measured authority is called before both browser print operations.
  trace?.start('composition');
  composeBrowserProposal(docForClone(doc, clone));
  trace?.done('composition');
  clone.style.position = 'static';
  clone.style.removeProperty('left');
  clone.style.removeProperty('top');
  return clone;
}

function docForClone(doc, clone) {
  return { querySelector: () => clone, defaultView: doc.defaultView };
}