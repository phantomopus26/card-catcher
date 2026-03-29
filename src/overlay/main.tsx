import React from 'react';
import { createRoot } from 'react-dom/client';
import { HudOverlay } from './HudOverlay';

const root = createRoot(document.getElementById('root')!);
root.render(<HudOverlay />);
