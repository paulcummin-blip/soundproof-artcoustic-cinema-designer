import React from 'react';

export class ErrorBoundary extends React.Component {
  constructor(props){ super(props); this.state = { error: null }; }
  static getDerivedStateFromError(error){ return { error }; }
  componentDidCatch(error, info){ /* no console in Base44, but UI shows */ }
  render(){
    if (this.state.error) {
      return (
        <div style={{padding:12, border:'1px solid #DCDBD6', background:'#FFF3F0', color:'#4A230F', borderRadius:8}}>
          <div style={{fontWeight:'bold'}}>Room Designer crashed</div>
          <div style={{fontFamily:'monospace', fontSize:12, marginTop:6}}>
            {String(this.state.error?.message || this.state.error)}
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}