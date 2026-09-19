import React, { useState, useEffect } from 'react';
import { DragDropContext, Droppable, Draggable } from '@hello-pangea/dnd';
import { Input } from '@/components/ui/input';
import { GripVertical, Trash2 } from 'lucide-react';

/**
 * Drag-orderable gallery list. Each item shows a thumbnail, caption input,
 * and delete button. Captions persist on blur.
 *
 * Props:
 * - items: [{ id, file_url, caption, order_index }]
 * - onReorder: (reorderedItems) => void
 * - onCaptionChange: (id, caption) => void
 * - onDelete: (id) => void
 */
export default function GalleryDragList({ items, onReorder, onCaptionChange, onDelete }) {
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
                    className="flex items-center gap-3 p-3 bg-white border border-[#DCDBD6] rounded-lg"
                  >
                    <div {...dragProvided.dragHandleProps} className="cursor-grab text-[#625143]">
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
                      placeholder="Caption..."
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