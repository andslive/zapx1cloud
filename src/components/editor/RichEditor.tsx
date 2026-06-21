import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Image from '@tiptap/extension-image';
import Link from '@tiptap/extension-link';
import Youtube from '@tiptap/extension-youtube';
import Placeholder from '@tiptap/extension-placeholder';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import {
  Bold, Italic, List, ListOrdered, Heading2, Heading3, Quote,
  Link2, Image as ImageIcon, Youtube as YoutubeIcon, Undo2, Redo2, Code
} from 'lucide-react';
import { useRef, useState } from 'react';
import { cn } from '@/lib/utils';

interface RichEditorProps {
  value?: any;
  onChange?: (json: any, html: string) => void;
  placeholder?: string;
  editable?: boolean;
  className?: string;
}

export function RichEditor({ value, onChange, placeholder = 'Comece a escrever...', editable = true, className }: RichEditorProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [showLinkInput, setShowLinkInput] = useState(false);
  const [showYoutubeInput, setShowYoutubeInput] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const [youtubeUrl, setYoutubeUrl] = useState('');
  const [uploading, setUploading] = useState(false);

  const editor = useEditor({
    extensions: [
      StarterKit,
      Image.configure({ HTMLAttributes: { class: 'rounded-lg max-w-full my-4' } }),
      Link.configure({ openOnClick: false, HTMLAttributes: { class: 'text-primary underline' } }),
      Youtube.configure({ HTMLAttributes: { class: 'rounded-lg my-4 w-full aspect-video' }, width: 640, height: 360 }),
      Placeholder.configure({ placeholder }),
    ],
    content: value || '',
    editable,
    onUpdate: ({ editor }) => {
      onChange?.(editor.getJSON(), editor.getHTML());
    },
    editorProps: {
      attributes: {
        class: cn(
          'prose prose-sm dark:prose-invert max-w-none focus:outline-none min-h-[200px] px-4 py-3',
          'prose-headings:font-semibold prose-a:text-primary prose-img:rounded-lg'
        ),
      },
    },
  });

  if (!editor) return null;

  const handleImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `articles/${Date.now()}-${Math.random().toString(36).slice(2)}.${ext}`;
      const { error } = await supabase.storage.from('help-media').upload(path, file);
      if (error) throw error;
      const { data: { publicUrl } } = supabase.storage.from('help-media').getPublicUrl(path);
      editor.chain().focus().setImage({ src: publicUrl }).run();
      toast.success('Imagem inserida');
    } catch (err: any) {
      toast.error('Falha ao subir imagem: ' + err.message);
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const applyLink = () => {
    if (!linkUrl) return;
    editor.chain().focus().extendMarkRange('link').setLink({ href: linkUrl }).run();
    setLinkUrl('');
    setShowLinkInput(false);
  };

  const applyYoutube = () => {
    if (!youtubeUrl) return;
    editor.commands.setYoutubeVideo({ src: youtubeUrl });
    setYoutubeUrl('');
    setShowYoutubeInput(false);
  };

  const ToolbarBtn = ({ onClick, active, children, title }: any) => (
    <Button
      type="button"
      variant={active ? 'secondary' : 'ghost'}
      size="icon"
      className="h-8 w-8"
      onClick={onClick}
      title={title}
    >
      {children}
    </Button>
  );

  return (
    <div className={cn('border rounded-lg bg-background', className)}>
      {editable && (
        <div className="flex flex-wrap gap-1 p-2 border-b">
          <ToolbarBtn title="Negrito" active={editor.isActive('bold')} onClick={() => editor.chain().focus().toggleBold().run()}>
            <Bold className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn title="Itálico" active={editor.isActive('italic')} onClick={() => editor.chain().focus().toggleItalic().run()}>
            <Italic className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn title="Título" active={editor.isActive('heading', { level: 2 })} onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}>
            <Heading2 className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn title="Subtítulo" active={editor.isActive('heading', { level: 3 })} onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}>
            <Heading3 className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn title="Lista" active={editor.isActive('bulletList')} onClick={() => editor.chain().focus().toggleBulletList().run()}>
            <List className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn title="Lista numerada" active={editor.isActive('orderedList')} onClick={() => editor.chain().focus().toggleOrderedList().run()}>
            <ListOrdered className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn title="Citação" active={editor.isActive('blockquote')} onClick={() => editor.chain().focus().toggleBlockquote().run()}>
            <Quote className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn title="Código" active={editor.isActive('codeBlock')} onClick={() => editor.chain().focus().toggleCodeBlock().run()}>
            <Code className="h-4 w-4" />
          </ToolbarBtn>
          <div className="w-px bg-border mx-1" />
          <ToolbarBtn title="Link" active={editor.isActive('link')} onClick={() => setShowLinkInput(v => !v)}>
            <Link2 className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn title="Imagem" onClick={() => fileInputRef.current?.click()}>
            <ImageIcon className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn title="YouTube" onClick={() => setShowYoutubeInput(v => !v)}>
            <YoutubeIcon className="h-4 w-4" />
          </ToolbarBtn>
          <div className="w-px bg-border mx-1" />
          <ToolbarBtn title="Desfazer" onClick={() => editor.chain().focus().undo().run()}>
            <Undo2 className="h-4 w-4" />
          </ToolbarBtn>
          <ToolbarBtn title="Refazer" onClick={() => editor.chain().focus().redo().run()}>
            <Redo2 className="h-4 w-4" />
          </ToolbarBtn>
          <input ref={fileInputRef} type="file" accept="image/*" hidden onChange={handleImageUpload} />
        </div>
      )}

      {showLinkInput && (
        <div className="flex gap-2 p-2 border-b bg-muted/40">
          <Input placeholder="https://..." value={linkUrl} onChange={(e) => setLinkUrl(e.target.value)} className="h-8 text-sm" />
          <Button size="sm" onClick={applyLink}>Aplicar</Button>
          <Button size="sm" variant="ghost" onClick={() => { editor.chain().focus().unsetLink().run(); setShowLinkInput(false); }}>Remover</Button>
        </div>
      )}
      {showYoutubeInput && (
        <div className="flex gap-2 p-2 border-b bg-muted/40">
          <Input placeholder="https://youtube.com/watch?v=..." value={youtubeUrl} onChange={(e) => setYoutubeUrl(e.target.value)} className="h-8 text-sm" />
          <Button size="sm" onClick={applyYoutube}>Inserir</Button>
        </div>
      )}

      <EditorContent editor={editor} />
      {uploading && <div className="px-4 py-2 text-xs text-muted-foreground border-t">Subindo imagem...</div>}
    </div>
  );
}
