import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { GripVertical, Trash2 } from 'lucide-react';

const CATEGORIES = [
  'Seating',
  'Lighting',
  'Cabinetry',
  'Equipment',
  'Construction',
  'Interior',
  'Exterior',
  'Joinery',
  'Acoustic Treatment',
  'Plan',
  'Elevation',
  'Lifestyle',
  'Other',
];

const IMPORTANCE_OPTIONS = [
  { value: 'Essential', color: 'bg-red-100 text-red-800 border-red-300' },
  { value: 'Preferred', color: 'bg-blue-100 text-blue-800 border-blue-300' },
  { value: 'Optional', color: 'bg-gray-100 text-gray-700 border-gray-300' },
  { value: 'Do Not Use', color: 'bg-gray-50 text-gray-400 border-gray-200 line-through' },
];

/**
 * Drag-orderable gallery list. Each item shows a thumbnail, caption input,
 * category dropdown, proposal importance selector, and delete button.
 * Captions persist on blur; category and importance persist on change.
 *
 * Props:
 * - items: [{ id, file_url, caption, order_index, category, proposal_importance }]
 * - onReorder: (reorderedItems) => void
 * - onCaptionChange: (id, caption) => void
 * - onCategoryChange: (id, category) => void
 * - onImportanceChange: (id, importance) => void
 * - onDelete: (id) => void
 */
export default function GalleryDragList({
  items,
  onReorder,
  onCaptionChange,
  onCategoryChange,
  onImportanceChange,
  onDelete,
}) {
  const [localCaptions, setLocalCaptions] = useState({});

  useEffect(() => {
    const map = {};
    (items || []).forEach((item) => {
      map[item.id] = item.caption || '';
    });
    setLocalCaptions(map);
  }, [items]);

  const handleDragEnd = (result) => {
    if (!result.destination || result.source.index === result.destination.index) return;
    const reordered = [...items];
    const [moved] = reordered.splice(result.source.index, 1);
    reordered.splice(result.destination.index, 0, moved);
    onReorder(reordered);
  };

  if (!items || items.length === 0) {
    return null;
  }

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId="gallery-list">
        {(provided) => (
          <div ref={provided.innerRef} {...provided.droppableProps} className="space-y-2">
            {items.map((item, index) => (
              <Draggable key={item.id} draggableId={item.id} index={index}>
                {(dragProvided) => (
                  <div
                    ref={dragProvided.innerRef}
                    {...dragProvided.draggableProps}
                    className="p-3 bg-white border border-[#DCDBD6] rounded-lg"
                  >
                    <div className="flex items-center gap-3">
                      <div {...dragProvided.dragHandleProps} className="cursor-grab text-[#625143] flex-shrink-0">
                        <GripVertical className="w-5 h-5" />
                      </div>
                      <img
                        src={item.file_url}
                        alt={item.caption || 'Gallery image'}
                        className="w-16 h-16 object-cover rounded-md border border-[#DCDBD6] flex-shrink-0"
                      />
                      <Input
                        value={localCaptions[item.id] || ''}
                        onChange={(e) =>
                          setLocalCaptions((prev) => ({ ...prev, [item.id]: e.target.value }))
                        }
                        onBlur={() => onCaptionChange(item.id, localCaptions[item.id] || '')}
                        placeholder="Caption (e.g. Rear seating area showing cinema bar)..."
                        className="flex-1 bg-white border-[#DCDBD6] text-[#1B1A1A]"
                      />
                      <button
                        type="button"
                        onClick={() => onDelete(item.id)}
                        className="p-2 text-[#625143] hover:text-red-600 transition-colors flex-shrink-0"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <div className="flex items-center gap-3 mt-2 pl-8">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[#625143] font-medium whitespace-nowrap">Category</span>
                        <Select
                          value={item.category || 'Other'}
                          onValueChange={(val) => onCategoryChange(item.id, val)}
                        >
                          <SelectTrigger className="w-[160px] h-8 text-xs bg-white border-[#DCDBD6]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {CATEGORIES.map((cat) => (
                              <SelectItem key={cat} value={cat} className="text-xs">
                                {cat}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-[#625143] font-medium whitespace-nowrap">Importance</span>
                        <Select
                          value={item.proposal_importance || 'Preferred'}
                          onValueChange={(val) => onImportanceChange(item.id, val)}
                        >
                          <SelectTrigger className="w-[140px] h-8 text-xs bg-white border-[#DCDBD6]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {IMPORTANCE_OPTIONS.map((opt) => (
                              <SelectItem key={opt.value} value={opt.value} className="text-xs">
                                {opt.value}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </div>
                    </div>
                  </div>
                )}
              </Draggable>
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
}