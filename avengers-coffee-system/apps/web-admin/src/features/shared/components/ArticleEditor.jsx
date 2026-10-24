import { useRef, useState } from 'react'
import { ArrowLeft as FiArrowLeft, Bold as FiBold, Italic as FiItalic, List as FiList, Type as FiType, Save as FiSave, Eye as FiEye, Edit2 as FiEdit2 } from '../../../components/console/WorkspaceIcons'
import { Button } from '../../../components/ui/button'
import { Input } from '../../../components/ui/input'
import { Label } from '../../../components/ui/label'
import { Textarea } from '../../../components/ui/textarea'
import SearchableSelect from '../../../components/console/SearchableSelect'
import { useWorkspacePage } from '../../../components/console/WorkspacePageContext'

function inline(text) {
  return text.split(/(\*\*[^*]+\*\*|\*[^*]+\*)/g).map((part,i)=>part.startsWith('**') ? <strong key={i}>{part.slice(2,-2)}</strong> : part.startsWith('*') ? <em key={i}>{part.slice(1,-1)}</em> : part)
}
export default function ArticleEditor({ form,setForm,onSubmit,onBack,busy,error,imagePreview,onImageChange,editing }) {
  useWorkspacePage(editing ? 'Chỉnh sửa bài viết' : 'Soạn bài viết mới','Soạn nội dung, định dạng và xuất bản bài viết của cửa hàng.')
  const field=useRef(null)
  const [preview,setPreview]=useState(false)
  const update=(key,value)=>setForm(previous=>({...previous,[key]:value}))
  const format=(before,after='',fallback='Nội dung')=>{
    const el=field.current; if(!el)return
    const start=el.selectionStart,end=el.selectionEnd,selected=form.content.slice(start,end)||fallback
    update('content',form.content.slice(0,start)+before+selected+after+form.content.slice(end))
    requestAnimationFrame(()=>{el.focus();el.setSelectionRange(start+before.length,start+before.length+selected.length)})
  }
  return <form className="article-editor-page" onSubmit={onSubmit}>
    <div className="article-editor-actions"><Button variant="outline" type="button" onClick={onBack} disabled={busy}><FiArrowLeft/>Danh sách bài viết</Button><Button type="submit" disabled={busy}><FiSave/>{busy?'Đang lưu…':editing?'Cập nhật bài viết':'Lưu bài viết'}</Button></div>
    {error&&<p role="alert" className="workspace-form-error">{error}</p>}
    <div className="article-editor-layout"><section className="article-editor-main">
      <Label htmlFor="article-title">Tiêu đề bài viết</Label><Input id="article-title" value={form.title} required onChange={e=>update('title',e.target.value)} placeholder="Nhập tiêu đề bài viết"/>
      <Label htmlFor="article-description">Mô tả ngắn</Label><Textarea id="article-description" rows={4} value={form.description} onChange={e=>update('description',e.target.value)} placeholder="Tóm tắt nội dung để giới thiệu bài viết…"/>
      <div className="article-content-heading"><Label htmlFor="article-content">Nội dung bài viết</Label><Button variant="ghost" type="button" onClick={()=>setPreview(!preview)}>{preview?<FiEdit2/>:<FiEye/>}{preview?'Soạn thảo':'Xem trước'}</Button></div>
      <div className="article-writing-surface"><div className="article-format-toolbar" role="toolbar" aria-label="Định dạng bài viết">
        <Button type="button" variant="ghost" size="icon" title="In đậm" aria-label="In đậm" onClick={()=>format('**','**')}><FiBold/></Button>
        <Button type="button" variant="ghost" size="icon" title="In nghiêng" aria-label="In nghiêng" onClick={()=>format('*','*')}><FiItalic/></Button>
        <Button type="button" variant="ghost" title="Tiêu đề đoạn" onClick={()=>format('\n## ','\n','Tiêu đề đoạn')}><FiType/>Tiêu đề</Button>
        <Button type="button" variant="ghost" title="Danh sách" onClick={()=>format('\n- ','\n','Mục danh sách')}><FiList/>Danh sách</Button>
      </div>{preview?<article className="article-preview">{form.content.split('\n').map((line,i)=>line.startsWith('#')?<h2 key={i}>{inline(line.replace(/^#+\s*/,''))}</h2>:line.startsWith('- ')?<ul key={i}><li>{inline(line.slice(2))}</li></ul>:<p key={i}>{inline(line)||<br/>}</p>)}</article>:<Textarea ref={field} id="article-content" required value={form.content} onChange={e=>update('content',e.target.value)} placeholder="Bắt đầu bài viết của bạn…"/>}</div>
    </section><aside className="article-editor-sidebar">
      <h2>Thiết lập bài viết</h2>
      <Label htmlFor="article-category">Danh mục</Label><SearchableSelect id="article-category" value={form.category} onChange={e=>update('category',e.target.value)} options={[{value:'BLOG',label:'Tin tức & khuyến mãi'},{value:'COFFEEHOLIC',label:'Góc cà phê'},{value:'TEAHOLIC',label:'Góc trà'}]}/>
      <Label htmlFor="article-author">Tác giả</Label><Input id="article-author" value={form.author_name} onChange={e=>update('author_name',e.target.value)}/>
      <Label htmlFor="article-publish">Xuất bản</Label><SearchableSelect id="article-publish" value={String(form.is_published)} onChange={e=>update('is_published',e.target.value==='true')} options={[{value:'true',label:'Xuất bản công khai'},{value:'false',label:'Lưu bản nháp'}]}/>
      <Label htmlFor="article-image">Ảnh đại diện</Label>{imagePreview&&<img src={imagePreview} alt="Ảnh đại diện bài viết"/>}<Input id="article-image" type="file" accept="image/*" onChange={e=>onImageChange(e.target.files?.[0]||null)}/><p>Chọn ảnh mới để thay thế ảnh hiện tại.</p>
    </aside></div>
  </form>
}
