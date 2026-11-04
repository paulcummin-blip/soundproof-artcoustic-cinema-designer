// useSavedReportView.js — React binding for the pure isometricReportViewStore.
import { useSyncExternalStore } from "react";
import { getSavedReportView, subscribeReportView } from "./isometricReportViewStore";

export function useSavedReportView(projectId, versionId) {
  return useSyncExternalStore(
    subscribeReportView,
    () => getSavedReportView(projectId, versionId),
    () => getSavedReportView(projectId, versionId),
  );
}