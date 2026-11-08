// 'sorting' view: category drop-boxes on top, a vocabulary card pool below.
// Touch-friendly drag-and-drop via @hello-pangea/dnd (works in Telegram WebView).
// After submit, misplaced cards turn red and show their correct category.
import { useEffect, useMemo, useState } from "react";
import {
  DragDropContext,
  Droppable,
  Draggable,
  type DropResult,
} from "@hello-pangea/dnd";
import type { SortingContent } from "../types";
import type { Answers } from "../lib/scoring";
import { shuffle } from "../lib/utils";
import { haptic } from "../lib/telegram";

interface Props {
  content: SortingContent;
  answers: Answers;
  revealed: boolean;
  onChange: (key: string, value: string) => void;
}

const POOL = "pool";
type Lists = Record<string, string[]>; // droppableId -> ordered word ids

export default function Sorting({
  content,
  answers,
  revealed,
  onChange,
}: Props) {
  // Local drag layout; `answers` stays the source of truth for scoring.
  const [lists, setLists] = useState<Lists>(() => {
    const init: Lists = { [POOL]: shuffle(content.words).map((w) => w.id) };
    content.categories.forEach((c) => (init[c.id] = []));
    return init;
  });

  // Keep answers in sync with card placement (pool = unanswered -> '').
  useEffect(() => {
    Object.entries(lists).forEach(([droppableId, wordIds]) => {
      wordIds.forEach((wid) => {
        const value = droppableId === POOL ? "" : droppableId;
        if (answers[`word-${wid}`] !== value) onChange(`word-${wid}`, value);
      });
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lists]);

  const onDragEnd = (result: DropResult) => {
    const { source, destination, draggableId } = result;
    if (!destination) return;
    if (
      source.droppableId === destination.droppableId &&
      source.index === destination.index
    )
      return;

    setLists((prev) => {
      const next: Lists = { ...prev };
      if (source.droppableId === destination.droppableId) {
        // Reorder within one list: remove from source index, then insert
        // at destination index in the SAME array. Splicing into the original
        // array (which still holds the item) would duplicate it.
        const list = [...prev[source.droppableId]];
        list.splice(source.index, 1);
        list.splice(destination.index, 0, draggableId);
        next[source.droppableId] = list;
        return next;
      }
      next[source.droppableId] = prev[source.droppableId].filter(
        (id) => id !== draggableId,
      );
      const dest = [...(prev[destination.droppableId] ?? [])];
      dest.splice(destination.index, 0, draggableId);
      next[destination.droppableId] = dest;
      return next;
    });
    haptic("medium");
  };

  const wordById = useMemo(
    () => Object.fromEntries(content.words.map((w) => [w.id, w])),
    [content.words],
  );

  const catName = (id: string) =>
    content.categories.find((c) => c.id === id)?.name ?? id;

  const renderCard = (wordId: string, index: number, droppableId: string) => {
    const word = wordById[wordId];
    const isWrong = revealed && word.categoryId !== droppableId;
    const isRight = revealed && word.categoryId === droppableId;
    return (
      <Draggable
        draggableId={wordId}
        index={index}
        key={wordId}
        isDragDisabled={revealed}
      >
        {(provided, snapshot) => {
          // Pool cards stay put during drags: dnd simulates the moving gap by
          // transforming siblings, which in a multi-row grid pushes cards past
          // the container border. Pool order is meaningless for scoring, so we
          // drop those transforms there; the dragged clone keeps its own style.
          const frozen = droppableId === POOL && !snapshot.isDragging;
          const style = frozen
            ? {
                ...provided.draggableProps.style,
                transform: "none",
                transition: "none",
              }
            : provided.draggableProps.style;
          return (
            <div
              ref={provided.innerRef}
              {...provided.draggableProps}
              {...provided.dragHandleProps}
              style={style}
              className={[
                "sorting__card",
                isWrong ? "is-wrong" : "",
                isRight ? "is-correct" : "",
              ].join(" ")}
            >
              {word.text}
              {isWrong && (
                <small className="sorting__fix">
                  → {catName(word.categoryId)}
                </small>
              )}
            </div>
          );
        }}
      </Draggable>
    );
  };

  return (
    <DragDropContext onDragEnd={onDragEnd}>
      <div className="sorting">
        {/* Category containers */}
        <div className="sorting__boxes">
          {content.categories.map((cat) => (
            <Droppable
              droppableId={cat.id}
              key={cat.id}
              isDropDisabled={revealed}
            >
              {(provided, snapshot) => (
                <div
                  ref={provided.innerRef}
                  {...provided.droppableProps}
                  className={[
                    "sorting__box",
                    snapshot.isDraggingOver ? "is-over" : "",
                  ].join(" ")}
                >
                  <h4 className="sorting__box-title">{cat.name}</h4>
                  {lists[cat.id]?.map((id, i) => renderCard(id, i, cat.id))}
                  {provided.placeholder}
                  {!lists[cat.id]?.length && (
                    <p className="sorting__empty">Drag words here</p>
                  )}
                </div>
              )}
            </Droppable>
          ))}
        </div>

        {/* Word pool: grid of equal cells; sibling transforms are neutralised
            in renderCard, so the tray layout is frozen mid-drag. */}
        <Droppable droppableId={POOL} isDropDisabled={revealed}>
          {(provided, snapshot) => (
            <div
              ref={provided.innerRef}
              {...provided.droppableProps}
              className={[
                "sorting__pool",
                snapshot.isDraggingOver ? "is-over" : "",
              ].join(" ")}
            >
              {lists[POOL]?.map((id, i) => renderCard(id, i, POOL))}
              {provided.placeholder}
            </div>
          )}
        </Droppable>
      </div>
    </DragDropContext>
  );
}
