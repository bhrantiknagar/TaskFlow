import { useEffect, useLayoutEffect, useState } from 'react';
import { createRoot } from 'react-dom/client';

function TaskFlowApp() {
  const [page, setPage] = useState('');

  useEffect(() => {
    const updatePage = event => setPage(event.detail);
    window.addEventListener('taskflow:page', updatePage);
    window.renderTaskFlowPage?.();
    return () => window.removeEventListener('taskflow:page', updatePage);
  }, []);

  useLayoutEffect(() => {
    window.__taskflowBindPage?.();
  }, [page]);

  return <div className="taskflow-react-root" dangerouslySetInnerHTML={{ __html: page }} />;
}

createRoot(document.getElementById('app')).render(<TaskFlowApp />);
