import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { Project } from "@/entities/Project";
import { base44 } from "@/api/base44Client";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";
import CreateProjectStatusPanel from "@/components/projects/CreateProjectStatusPanel";
import { useProjectStatuses } from "@/components/projects/useProjectStatuses";
import { normalizeStatusId } from "@/components/projects/statusDefaults";
import {
  buildProjectEditPayload,
  refreshProjectIdentityAfterEdit,
} from "@/components/projects/projectEditSync";

export const dolbyConfigs = [
  { value: "5.1", label: "5.1 Surround — P2 - L1" },
  { value: "7.1", label: "7.1 Surround — P2 - L1" },
  { value: "5.1.2", label: "5.1.2 Atmos — P2 - L1" },
  { value: "5.1.4", label: "5.1.4 Atmos — P2 - L1" },
  { value: "5.1.6", label: "5.1.6 Atmos — P2 - L2" },
  { value: "7.1.2", label: "7.1.2 Atmos — P2 - L1" },
  { value: "7.1.4", label: "7.1.4 Atmos — P2 - L2" },
  { value: "7.1.6", label: "7.1.6 Atmos — P2 - L2" },
  { value: "9.1.2", label: "9.1.2 Atmos — P2 - L2" },
  { value: "9.1.4", label: "9.1.4 Atmos — P2 - L2" },
  { value: "9.1.6", label: "9.1.6 Atmos — P2 - L4" },
];

export const splOptions = [
  { value: "99",  label: "99 dB — P12 - L1 Minimum" },
  { value: "102", label: "102 dB — P12 - L2 Minimum" },
  { value: "105", label: "105 dB — P12 - L3 Minimum" },
  { value: "108", label: "108 dB — P12 - L4 Minimum" },
  { value: "102", label: "102 dB — P12 - L1 Recommended" },
  { value: "105", label: "105 dB — P12 - L2 Recommended" },
  { value: "108", label: "108 dB — P12 - L3 Recommended" },
  { value: "111", label: "111 dB — P12 - L4 Recommended" },
];

const EMPTY_FORM = {
  name: "",
  client_name: "",
  project_reference: "",
  project_status: "prospective",
  room_length: "",
  room_width: "",
  room_height: "",
  dolby_config: "",
  target_spl: 105,
  amplifier_power: "",
  notes: ""
};

// editProject: if provided, modal is in edit mode
export default function NewProjectDialog({ open, onOpenChange, onProjectCreated, editProject, onProjectUpdated }) {
  const isEditMode = !!editProject;
  const { user } = useAuth();
  const { activeStatuses } = useProjectStatuses();

  const [formData, setFormData] = useState(EMPTY_FORM);
  // Snapshot of the form values as they were when the dialog opened for editing.
  // Used to submit only the fields the user has intentionally changed, so an
  // identity-only correction (e.g. fixing a client-name spelling) never
  // resubmits unchanged engineering-summary fields.
  const [originalFormData, setOriginalFormData] = useState(EMPTY_FORM);
  const [editError, setEditError] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [createStatus, setCreateStatus] = useState(null);
  const navigate = useNavigate();

  // When editProject changes (or dialog opens), populate form
  useEffect(() => {
    setCreateStatus(null);
    setEditError(null);
    if (isEditMode && editProject) {
      const populated = {
        name: editProject.name || "",
        client_name: editProject.client || "",
        project_reference: editProject.project_reference || "",
        project_status: normalizeStatusId(editProject.status || "prospective"),
        room_length: editProject.roomLength != null ? String(editProject.roomLength) : "",
        room_width: editProject.roomWidth != null ? String(editProject.roomWidth) : "",
        room_height: editProject.roomHeight != null ? String(editProject.roomHeight) : "",
        dolby_config: editProject.dolby_config || "",
        target_spl: editProject.target_spl ?? 105,
        amplifier_power: editProject.amplifier_power != null ? String(editProject.amplifier_power) : "",
        notes: editProject.notes || "",
      };
      setFormData(populated);
      setOriginalFormData(populated);
    } else if (!isEditMode) {
      setFormData(EMPTY_FORM);
      setOriginalFormData(EMPTY_FORM);
    }
  }, [editProject, open]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setEditError(null);
    try {
      if (isEditMode) {
        // Submit ONLY the fields the user has intentionally changed. Comparing
        // the current form against the snapshot taken when the dialog opened
        // means a client-name-only correction sends only client_name, and
        // unchanged engineering-summary fields (room dimensions, Dolby config,
        // target SPL, amplifier power) are never resubmitted.
        const { payload, hasChanges } = buildProjectEditPayload(originalFormData, formData);
        if (!hasChanges) {
          // Nothing changed — close without a write.
          onOpenChange(false);
          return;
        }
        setIsSaving(true);
        let updated;
        try {
          updated = await Project.update(editProject.id, payload);
        } catch (saveErr) {
          // Keep the user's edited values in the form so they can retry without
          // re-entering the information. Do not close the dialog. Preserve the
          // existing System Health instrumentation by re-throwing to the outer
          // catch, which records the failure for admin investigation.
          throw saveErr;
        }
        // The backend confirmed the update. Only now refresh identity surfaces
        // and propagate the new record, so the new value is never shown as
        // saved before the backend confirms it.
        refreshProjectIdentityAfterEdit(editProject.id, updated);
        onProjectUpdated && onProjectUpdated(updated);
        onOpenChange(false);
      } else {
        setCreateStatus('SUBMITTING');
        try {
          const createPayload = {
            name: formData.name,
            client_name: formData.client_name,
            project_reference: formData.project_reference,
            project_status: formData.project_status,
            room_length: formData.room_length ? parseFloat(formData.room_length) : null,
            room_width: formData.room_width ? parseFloat(formData.room_width) : null,
            room_height: formData.room_height ? parseFloat(formData.room_height) : null,
            dolby_config: formData.dolby_config,
            target_spl: formData.target_spl,
            amplifier_power: formData.amplifier_power ? parseInt(formData.amplifier_power) : null,
            notes: formData.notes,
            acoustic_treatment_enabled: false,
          };
          const res = await base44.functions.invoke('createProfessionalProject', {
            name: createPayload.name,
            client_name: createPayload.client_name,
            project_reference: createPayload.project_reference,
            project_status: createPayload.project_status,
            room_length: createPayload.room_length,
            room_width: createPayload.room_width,
            room_height: createPayload.room_height,
            dolby_config: createPayload.dolby_config,
            target_spl: createPayload.target_spl,
            amplifier_power: createPayload.amplifier_power,
            notes: createPayload.notes,
            acoustic_treatment_enabled: false,
          });
          const result = res.data;
          if (result.status === 'SUCCESS') {
            setFormData(EMPTY_FORM);
            setCreateStatus(null);
            onProjectCreated && onProjectCreated(result.project);
            onOpenChange(false);
          } else {
            setCreateStatus(result.status || 'CREATION_FAILED');
          }
        } catch (err) {
          const result = err?.response?.data;
          if (result?.status === 'OUT_OF_CAPACITY') {
            setCreateStatus('OUT_OF_CAPACITY');
          } else if (result?.status === 'ACCOUNT_NOT_LINKED') {
            setCreateStatus('ACCOUNT_NOT_LINKED');
          } else if (result?.status === 'DEALER_NOT_LINKED') {
            setCreateStatus('DEALER_NOT_LINKED');
          } else {
            setCreateStatus('CREATION_FAILED');
          }
        }
      }
    } catch (error) {
      console.error("Failed to save project:", error);
      // Keep the user's edited values in the form (do not reset/close) so they
      // can retry. The error is surfaced inline and the technical cause
      // remains available to administrators via the existing System Health
      // instrumentation that observes Project update failures.
      setEditError(error?.message || "Failed to save project. Please try again.");
    } finally {
      setIsSaving(false);
    }
    };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="bg-white border-[#DCDBD6] text-[#1B1A1A] max-w-2xl overflow-y-auto max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="text-xl font-bold font-header">{isEditMode ? "Edit Cinema Project" : "Create New Cinema Project"}</DialogTitle>
        </DialogHeader>
        
        {createStatus && createStatus !== 'SUBMITTING' ? (
          <CreateProjectStatusPanel
            status={createStatus}
            onPurchaseProjects={() => {
              setCreateStatus(null);
              onOpenChange(false);
              navigate('/PurchaseProjects');
            }}
            onRetry={() => setCreateStatus(null)}
            onClose={() => {
              setCreateStatus(null);
              onOpenChange(false);
            }}
          />
        ) : (
        <form onSubmit={handleSubmit} className="space-y-6 font-body">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="md:col-span-2">
              <Label className="text-[#3E4349]">Project Name *</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({...formData, name: e.target.value})}
                className="bg-white border-[#DCDBD6] text-[#1B1A1A]"
                placeholder="e.g. Johnson Family Cinema"
                required
              />
            </div>
            
            <div>
              <Label className="text-[#3E4349]">Client Name</Label>
              <Input
                value={formData.client_name}
                onChange={(e) => setFormData({...formData, client_name: e.target.value})}
                className="bg-white border-[#DCDBD6] text-[#1B1A1A]"
                placeholder="Client name"
              />
            </div>

            <div>
              <Label className="text-[#3E4349]">Project Reference</Label>
              <Input
                value={formData.project_reference}
                onChange={(e) => setFormData({...formData, project_reference: e.target.value})}
                className="bg-white border-[#DCDBD6] text-[#1B1A1A]"
                placeholder="e.g. AC-2026-014"
              />
            </div>

            <div>
              <Label className="text-[#3E4349]">Project Status</Label>
              <Select
                value={formData.project_status}
                onValueChange={(value) => setFormData({...formData, project_status: value})}
              >
                <SelectTrigger className="bg-white border-[#DCDBD6] text-[#1B1A1A]">
                  <SelectValue placeholder="Select status" />
                </SelectTrigger>
                <SelectContent className="bg-white border-[#DCDBD6]">
                  {activeStatuses.map((s) => (
                    <SelectItem key={s.status_id} value={s.status_id} className="text-[#1B1A1A]">
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-[#3E4349]">Dolby Configuration</Label>
              <Select 
                value={formData.dolby_config} 
                onValueChange={(value) => setFormData({...formData, dolby_config: value})}
              >
                <SelectTrigger className="bg-white border-[#DCDBD6] text-[#1B1A1A]">
                  <SelectValue placeholder="Select Dolby config" />
                </SelectTrigger>
                <SelectContent className="bg-white border-[#DCDBD6]">
                  {dolbyConfigs.map((config) => (
                    <SelectItem key={config.value} value={config.value} className="text-[#1B1A1A]">
                      {config.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-[#3E4349]">Room Length (m)</Label>
              <Input
                type="number"
                step="0.1"
                value={formData.room_length}
                onChange={(e) => setFormData({...formData, room_length: e.target.value})}
                className="bg-white border-[#DCDBD6] text-[#1B1A1A]"
              />
            </div>

            <div>
              <Label className="text-[#3E4349]">Room Width (m)</Label>
              <Input
                type="number"
                step="0.1"
                value={formData.room_width}
                onChange={(e) => setFormData({...formData, room_width: e.target.value})}
                className="bg-white border-[#DCDBD6] text-[#1B1A1A]"
              />
            </div>

            <div>
              <Label className="text-[#3E4349]">Room Height (m)</Label>
              <Input
                type="number"
                step="0.1"
                value={formData.room_height}
                onChange={(e) => setFormData({...formData, room_height: e.target.value})}
                className="bg-white border-[#DCDBD6] text-[#1B1A1A]"
              />
            </div>

            <div>
              <Label className="text-[#3E4349]">Target SPL (dB) LCR</Label>
              <Select 
                value={formData.target_spl.toString()} 
                onValueChange={(value) => setFormData({...formData, target_spl: parseInt(value)})}
              >
                <SelectTrigger className="bg-white border-[#DCDBD6] text-[#1B1A1A]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-white border-[#DCDBD6]">
                  {splOptions.map((opt, i) => (
                    <SelectItem key={i} value={opt.value} className="text-[#1B1A1A]">{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="md:col-span-2">
              <Label className="text-[#3E4349]">Notes</Label>
              <Textarea
                value={formData.notes}
                onChange={(e) => setFormData({...formData, notes: e.target.value})}
                className="bg-white border-[#DCDBD6] text-[#1B1A1A] h-24"
                placeholder="Project requirements, special considerations..."
              />
            </div>
          </div>

          {isEditMode && editError && (
            <div className="text-sm text-red-700 bg-red-50 border border-red-200 rounded-md px-3 py-2">
              {editError}
            </div>
          )}
          <div className="flex w-full shrink-0 justify-end gap-3 pt-4 pb-2">
            <Button
              type="button"
              variant="outline"
              onClick={() => onOpenChange(false)}
              className="border-[#DCDBD6] text-[#3E4349]"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              disabled={!formData.name || createStatus === 'SUBMITTING' || isSaving}
              className="hover:bg-[#3E4349]"
              style={{ backgroundColor: "#1B1A1A", color: "#FFFFFF" }}
            >
              {createStatus === 'SUBMITTING' ? "Creating..." : isSaving ? "Saving..." : isEditMode ? "Save Changes" : "Create Project"}
            </Button>
          </div>
        </form>
        )}
      </DialogContent>
    </Dialog>
  );
}