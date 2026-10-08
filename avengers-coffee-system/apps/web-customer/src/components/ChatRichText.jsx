import { inlineText, textBlocks } from './chatText';
import './ChatRichText.css';

function Inline({ text, nodes }) {
  return (nodes || inlineText(text)).map((node, index) => node.type === 'strong'
    ? <strong key={index}><Inline nodes={node.children} /></strong>
    : node.type === 'em' ? <em key={index}><Inline nodes={node.children} /></em>
      : node.text);
}

export default function ChatRichText({ text }) {
  return <div className="chat-rich-text">{textBlocks(text).map((block, index) => {
    if (block.type === 'rule') return <hr key={index} />;
    if (block.type === 'heading') return <p className="chat-rich-heading" key={index}><Inline text={block.text} /></p>;
    if (block.items) {
      const List = block.type === 'ordered' ? 'ol' : 'ul';
      return <List key={index} start={block.start}>{block.items.map((item, itemIndex) => <li key={itemIndex}><Inline text={item} /></li>)}</List>;
    }
    return <p key={index}><Inline text={block.text} /></p>;
  })}</div>;
}
