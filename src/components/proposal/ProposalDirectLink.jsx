import React from 'react';
import { useParams, Navigate } from 'react-router-dom';

/**
 * Redirects /proposal/:proposalId → /ProposalEditor?proposalId=:proposalId
 * Keeps direct proposal links valid without changing the ProposalEditor component.
 */
export default function ProposalDirectLink() {
  const { proposalId } = useParams();
  if (!proposalId) return <Navigate to="/ProposalCentre" replace />;
  return <Navigate to={`/ProposalEditor?proposalId=${proposalId}`} replace />;
}