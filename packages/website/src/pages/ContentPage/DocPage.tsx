import { InlineLoading } from 'carbon-components-react';
import dayjs from 'dayjs';
import { Stack } from 'office-ui-fabric-react';
import styles from '../FileAction.module.scss';
import Avatar from 'react-avatar';
import responsiveStyle from '../../layout/responsive.module.scss';
import React, { useCallback, useEffect, useState } from 'react';
import { useDispatch, useSelector } from 'react-redux'
import { useHistory } from 'react-router-dom';
import { useManagedRenderStack } from '../../context/RenderStack';
import { history, DriveFile, parseDriveLink } from '../../utils';
import { fromHTML } from '../../utils/docHeaders';
import { setHeaders } from '../../reduxSlices/headers';
import { selectRevisions, disableRevisions } from '../../reduxSlices/files';

export interface IDocPageProps {
  file: DriveFile;
  renderStackOffset?: number;
}

function isModifiedEvent(event) {
  return !!(event.metaKey || event.altKey || event.ctrlKey || event.shiftKey);
}

function prettify(baseEl: HTMLElement, fileId: string) {
  {
    // Remove all font families, except for some monospace fonts.
    const monoFF = ['source code', 'courier', 'mono'];
    const elements = baseEl.getElementsByTagName('*') as HTMLCollectionOf<HTMLElement>;
    for (const el of elements) {
      if (el.style) {
        const ff = el.style.fontFamily.toLowerCase();
        let isMonoFont = false;
        for (const f of monoFF) {
          if (ff.indexOf(f) > -1) {
            isMonoFont = true;
            break;
          }
        }
        el.style.fontFamily = '';
        if (isMonoFont) {
          el.classList.add('__gdoc_monospace');
        }
      }
    }
  }
  {
    // Rewrite `https://www.google.com/url?q=`
    const elements = baseEl.getElementsByTagName('a');
    for (const el of elements) {
      if (el.href.indexOf('https://www.google.com/url') !== 0) {
        continue;
      }
      const url = new URL(el.href);
      const newHref = url.searchParams.get('q');
      if (newHref) {
        el.href = newHref;
      }
    }
  }
  {
    // Open Google Doc and Google Drive link inline, for other links open in new window.
    const elements = baseEl.getElementsByTagName('a');
    for (const el of elements) {
      const id = parseDriveLink(el.href);
      if (id) {
        el.href = history.createHref({ pathname: `/view/${id}` });
        el.dataset['__gdoc_history'] = `/view/${id}`;
        continue;
      }
      if ((el.getAttribute('href') ?? '').indexOf('#') !== 0) {
        el.target = '_blank';
        el.classList.add('__gdoc_external_link');
        continue;
      }
    }
  }
  if (fileId) {
    externallyLinkHeaders(baseEl, fileId)
  }
}

function externallyLinkHeaders(baseEl: HTMLElement, fileId: string) {
    // Link from headers into the GDoc
    const headers = Array.from(baseEl.querySelectorAll("h1, h2, h3, h4, h5, h6")) as HTMLHeadingElement[]
    for (const el of headers) {
      let inner = el.childNodes[0]
      let link = document.createElement('a')
      link.target = '_blank';
      link.classList.add('__gdoc_external_link');
      link.href = 'https://docs.google.com/document/d/' + fileId +  '/edit#heading=' + el.id;
      el.appendChild(link);
      link.appendChild(inner);
    }
}

function DocPage({ file, renderStackOffset = 0 }: IDocPageProps) {
  const [docContent, setDocContent] = useState('');
  const [isLoading, setIsLoading] = useState(true);
  const revs: Array<gapi.client.drive.Revision> = []
  const [revisions, setRevisions] = useState(revs);
  const [viewRevision, setViewRevision] = useState(0);
  const history = useHistory();
  const dispatch = useDispatch();
  const revisionsEnabled = useSelector(selectRevisions);

  useManagedRenderStack({
    depth: renderStackOffset,
    id: 'DocPage',
    file,
  });

  function updateDoc(content: HTMLBodyElement | string) {
    console.log("Update DOC");
    if (typeof content === "string"){
      setDocContent(content);
    } else {
      setDocContent(content.innerHTML);
      console.log("Setting headers");
      dispatch(setHeaders(
        Array.from(content.querySelectorAll("h1, h2, h3, h4, h5, h6")).map(fromHTML)
      ));
    }
  }

  function loadHtml(body: string){
    const parser = new DOMParser();
    const htmlDoc = parser.parseFromString(body, 'text/html');
    const bodyEl = htmlDoc.querySelector('body');
    if (bodyEl) {
      prettify(bodyEl, file.id ?? '');
      const styleEls = htmlDoc.querySelectorAll('style');
      styleEls.forEach((el) => bodyEl.appendChild(el));
      updateDoc(bodyEl);
    } else {
      updateDoc('Error?');
    }
  }

  useEffect(() => {
    async function loadPreview() {
      setIsLoading(true);
      updateDoc('');

      try {
        const resp = await gapi.client.drive.files.export({
          fileId: file.id!,
          mimeType: 'text/html',
        });
        console.log('DocPage files.export', file.id, resp);
        loadHtml(resp.body)
      } finally {
        setIsLoading(false);
      }
    }
    loadPreview();

    return function(){ dispatch(setHeaders([])) }
  }, [file.id]);

  useEffect(() => {
    const fields = "revisions(id, modifiedTime, lastModifyingUser, exportLinks)"
    async function loadRevisions() {
      try {
        const resp = await gapi.client.drive.revisions.list({fileId: file.id!, fields})
        setRevisions(resp.result.revisions!.reverse());
      } catch(e) {
        console.error('DocPage files.revisions', file.id, e);
      }
    }

    if (revisionsEnabled) {
      loadRevisions();
    } else {
      setRevisions([]);
    }

    return function(){ dispatch(disableRevisions()) }
  }, [file.id, revisionsEnabled]);

  const handleDocContentClick = useCallback(
    (ev: React.MouseEvent) => {
      if (isModifiedEvent(ev)) {
        return;
      }
      const h = (ev.target as HTMLElement).dataset?.['__gdoc_history'];
      if (h) {
        ev.preventDefault();
        history.push(h);
      }
    },
    [history]
  );

  return (
    <div style={{ maxWidth: '50rem' }}>
      {(revisions.length > 0) && (
        <div className="revisions">
          {revisions.map((revision) => {
            const htmlLink = (revision.exportLinks ?? {})["text/html"];
            return (<Stack
              key={revision.id}
              verticalAlign="center"
              horizontal
              tokens={{ childrenGap: 8 }}
              className={styles.note}
            >
              <a href={htmlLink}>
                {dayjs(revision.modifiedTime).fromNow()}
              </a>
              <Avatar
                name={revision.lastModifyingUser?.displayName}
                src={revision.lastModifyingUser?.photoLink}
                size="20"
                round
              />
              <span>
                {revision.lastModifyingUser?.displayName}
              </span>
            </Stack>
            )
          })
        }
        </div>
      )}
      {isLoading && <InlineLoading description="Loading document content..." />}
      {!isLoading && (
        <div id="gdoc-html"
          style={{ maxWidth: '50rem' }}
          dangerouslySetInnerHTML={{ __html: docContent }}
          onClick={handleDocContentClick}
        />
      )}
    </div>
  );
}

export default React.memo(DocPage);
