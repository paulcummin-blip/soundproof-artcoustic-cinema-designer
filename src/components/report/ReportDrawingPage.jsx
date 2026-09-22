import React from 'react';

const HEADING_FONT = '"Futura PT Light", "Century Gothic", sans-serif';
const BODY_FONT = '"Didact Gothic", "Century Gothic", sans-serif';

export default function ReportDrawingPage({
  id,
  blockName,
  title,
  projectName,
  clientName,
  sheetCode,
  status,
  imageSrc,
  imageAlt,
  children,
  className = '',
}) {
  const projectLine = [projectName, clientName].filter(Boolean).join(' · ');
  const pageClassName = [
    'report-page-block',
    'report-drawing-page',
    'standard-drawing-page',
    className,
  ].filter(Boolean).join(' ');

  return (
    <section
      id={id}
      className={pageClassName}
      data-report-block={blockName}
      data-report-block-kind="drawing"
      data-report-page-start="true"
      style={{
        background: '#FFFFFF',
        color: '#1B1A1A',
        fontFamily: BODY_FONT,
        boxSizing: 'border-box',
      }}
    >
      <header className="standard-drawing-page__header">
        <div className="standard-drawing-page__heading">
          <div className="standard-drawing-page__title" style={{ fontFamily: HEADING_FONT }}>
            {title}
          </div>
          <div className="standard-drawing-page__project">
            {projectLine || ' '}
          </div>
        </div>

        <div className="standard-drawing-page__metadata">
          {sheetCode && (
            <div>
              <span>Drawing</span>
              <strong>{sheetCode}</strong>
            </div>
          )}
          {status && (
            <div>
              <span>Status</span>
              <strong>{status}</strong>
            </div>
          )}
        </div>
      </header>

      <div className="standard-drawing-page__frame">
        <div className="standard-drawing-page__content">
          {imageSrc ? (
            <img
              className="standard-drawing-page__image"
              src={imageSrc}
              alt={imageAlt || title}
            />
          ) : children}
        </div>
      </div>
    </section>
  );
}
