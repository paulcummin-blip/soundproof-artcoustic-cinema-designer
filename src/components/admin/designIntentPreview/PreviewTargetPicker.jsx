/**
 * PreviewTargetPicker.jsx
 * -----------------------
 * The two choices the admin preview needs before it can run: which existing project
 * and which of its design versions to write the Design Intent for. It changes no
 * project data — choosing a target here only decides what is read.
 */

import React from 'react';
import { REPORT_FONT_BODY } from '@/components/report/typography/reportTypography';

const LABEL = {
  fontFamily: REPORT_FONT_BODY,
  fontSize: 11,
  letterSpacing: '0.06em',
  textTransform: 'uppercase',
  color: '#625143',
  display: 'block',
  marginBottom: 4,
};

const SELECT = {
  fontFamily: REPORT_FONT_BODY,
  fontSize: 13,
  color: '#1B1A1A',
  background: '#FFFFFF',
  border: '1px solid #DCDBD6',
  borderRadius: 6,
  padding: '7px 10px',
  minWidth: 300,
};

/**
 * @param {Object} props
 * @param {Array<Object>} props.projects
 * @param {Array<Object>} props.versions
 * @param {string} props.projectId
 * @param {string} props.versionId
 * @param {Function} props.onProjectChange
 * @param {Function} props.onVersionChange
 * @param {boolean} [props.disabled]
 */
export default function PreviewTargetPicker({
  projects = [],
  versions = [],
  projectId = '',
  versionId = '',
  onProjectChange,
  onVersionChange,
  disabled = false,
}) {
  return (
    <div className="flex flex-wrap items-end gap-4">
      <div>
        <label htmlFor="di-preview-project" style={LABEL}>Project</label>
        <select
          id="di-preview-project"
          value={projectId}
          disabled={disabled}
          onChange={(event) => onProjectChange(event.target.value)}
          style={SELECT}
        >
          {projects.length === 0 && <option value="">No projects available</option>}
          {projects.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name || 'Untitled project'}
              {project.client_name ? ` — ${project.client_name}` : ''}
            </option>
          ))}
        </select>
      </div>

      <div>
        <label htmlFor="di-preview-version" style={LABEL}>Design version</label>
        <select
          id="di-preview-version"
          value={versionId}
          disabled={disabled || versions.length === 0}
          onChange={(event) => onVersionChange(event.target.value)}
          style={SELECT}
        >
          {versions.length === 0 && <option value="">No versions</option>}
          {versions.map((version) => (
            <option key={version.id} value={version.id}>
              {version.version_name || `Version ${version.version_number}`}
            </option>
          ))}
        </select>
      </div>
    </div>
  );
}