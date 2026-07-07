import PDFDocument from 'pdfkit';
import puppeteer from 'puppeteer-core';
import { query } from '../db/pool';

// ── Shared helpers ────────────────────────────────────────────

// Normalize whatever pg returns (string "2026-04-25", Date object, or timestamp)
// into a guaranteed "YYYY-MM-DD" string safe for further parsing.
function toIsoDate(d: any): string {
  if (!d) return '';
  if (d instanceof Date) return d.toISOString().slice(0, 10);
  const s = String(d);
  // Already ISO: "2026-04-25" or "2026-04-25T..."
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
  // Fallback: try parsing then re-format
  const parsed = new Date(s);
  if (!isNaN(parsed.getTime())) return parsed.toISOString().slice(0, 10);
  return '';
}

function fmtDate(d: any): string {
  const iso = toIsoDate(d);
  if (!iso) return '—';
  return new Date(iso + 'T12:00:00').toLocaleDateString('nl-NL', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}
function fmtDateShort(d: any): string {
  const iso = toIsoDate(d);
  if (!iso) return '—';
  return new Date(iso + 'T12:00:00').toLocaleDateString('nl-NL', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}
function fmtMoney(v: any): string {
  return `€ ${parseFloat(v || 0).toFixed(2).replace('.', ',')}`;
}

// ── Logo (embedded base64) ────────────────────────────────────
export const LOGO_B64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAyYAAAE6CAMAAADUYrbJAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsQAAA7EAZUrDhsAAAAZdEVYdFNvZnR3YXJlAEFkb2JlIEltYWdlUmVhZHlxyWU8AAAA3lBMVEUlN4UrLoMsLYMtK4MtLIMuKoMuK4MvKYMvKoMwKIMwKYMxJ4MzRI04O4s+NYtAUJRGSJNLQpNOXZxTVZpYUJpcaaRgYqJlXaJpdqttb6pucKpxa6pya6p3grN7fLJ7fbJ+eLJ/eLKFj7uIibmIirmLhrmSm8KVlsGVl8GYk8Gfp8mio8mipMmloMmlocmttNGvsNCwsdGxrtCyrtG7wNm8vdi9vti+u9i/vNjIzeDKy+DLyeDMyeDW2ejX2OjY1ujY1+jk5e/k5vDl5O/l5PDl5fDx8vfy8ffy8vf///93Pg5zAAAgmklEQVR42u2de2PaNtvG6da3z1YSJySAsxbSkBYSs5K0JBvlkJJByuH7f6HXJxnLR8mWbdm5rj/WkQTJsu+fpFu6bNf2EATFqIZTAEHABIKACQQBE0H6bzb7dnPzqd0+fWPotP3l23+4+BAw8aLh0/nfO1x/6DViEoeGR58wpECvBBNONGh9wYgCVRaTVGhQOv4HQQBVCBNxaHgGFEQBVG5MxKJx3G7/dWuILq6NiRdUOkyyQOPrbPaTquTX97ZrzQucQGXAJBc0PPp1CU4g6TEpAg1aP8+dlWFEAiQPJsWjQeszKepvhAJUKCayoUHpOykWG41Q7pjsZrN/bm6+yIlGICdtxAKUByYOGufSovFzNvuqrwf/+8v1s692hdhmhLLCpDRo/NVuH7tqOv16WNv6y/4RggESjcns5oMYNN602+180KB1+q+D+jGGE0g8JrtvH0SgcTubzfJFg9Znz7TrA6IBEobJf5+Oy4sGpUtSjL3OgD1GSBAmu5ui0fg1m32/vb0UsYj21S7y1vr4DeEACcFkdlp2NKglA3vF6xdmXZBATL6UFo3f3r79/d27P96//7Ner//xm2fadY61LkgUJru2hw3ZR423b986aND63f4Lezj5jOQEEoTJzrUAfP71p8xo/F8QGpTeUtnJv9anGeIBSomJi5LLn6VEw60/rW/+ZadcwAQSg8knZySZlRSNgOHk3O4CrDJvEA9QOkz+9u3KlQ8Nt95ZRdoHCkwgEZj8JKH6vcRoABMoW0zOIykpCRoBmOzczYOZHkqFyTfPvrU5oS8dGm69p7L2NjCB0mNySi0MGfp+Xj40gAmUJSb2YHLs7L/NTsuIRgAmtp3+M5WpQFASTM49icnncqJByTq0W6tBt8AESovJf577+y7LigYwgbLD5G96MPlaWjT8mNi7QHCrQKkxaVOLp7/Ki4Z/G97O2uFWgVJjQi9zEZ/wb3+UDg1gAmWGyU9qGk8Gk9/r5RZMXZBQTOiu1s5235acErhVILGY3FCpiT3nqgMTCJj4MaEC6m1VMIGpC8oOk3elxwRuFQiYABMImMDUBUmNyXlFchO4VSChmPwTMD0BJhAwoTSrMiYwdUFZYPK5IvsmcKtAQjHZBU1PgAkETCgVgUlT1XWl2TI+NGHqguTHhJ7Fv8+CDUVVNe3HYhF2IC+LH9qVqsCtAkmIyXnA9EQsJg1Vu1s8sx70bqF9VIAJJBcm7QwxUVTtYZHkyJ/vUqICUxeUASb0LF7ENryq/XhJdfSLfgNuFUgSTL6Id6soH+8WQhrwfKUAE0gGTESbulTtWWATdg/NNJjA1AUJxYSaxSfdhleuHsS/lGqhwq0CFY2JMFOXcvUjo3YkAQWYQCIxEWTqyoyRhKDA1AVlgAk9i+fdVX/I/AWgD5zJPNwqkEhM0pu6rp7zaMzuIzCBCsMkpalL0XJ7k/QPhRsTmLogoZgkM3U1HvJsz07l3oan2ghMoMSYJDd15QuJoT4wgYrBJKmpS7kroEkPMHVBBWLCberKLyeh9KzArQIVgEkyU9dLUY1i5ASYQEIxSWbqKq5VbJzA1AVlgQmnqWsnOydwq0AiMUlm6lrsJecEmJRb407DuK9vtJUEk1npMNkvYOqquCaNw/61VJhwmrp+FHoW7+BWqbRG7ivZ2cqASTJTl1bsebwCJlWecNGXsicDJvsyYrJrwtRVWa29uedYHkw4TV39gk/lM9wqlZXPktSUAZNEpi616HOpAZOqyj9T2EqASTtfTBaLB/JYVP0hkCJPZhamruV8PrKOdTSfr6WKpu3cOTZtLNvBpZH/Ys6lwYTT1JVkHNz90PwPP218vEtmfFlk7FZZjvv+o1V7YwnCcTnWgp663Ohoc2CSFSZfcnGrvNyFd//NuySb+lfZYbIedcK3MBv9ZZH5bdShGcun423ZMZFz0pWHqSvumQ9JboJ8UbIxdW3HsctozXExAcRwaMYC6rLcmPR8HdNeHkwyNXUx3L7Cf4+XloVbZdtnsow1JgVAorHe5qyWOlFZ12VcEM7D1MVybT/yDig7JQNM5nVpQ5H50Irf10qnfp7rwayY5GHqYuoGm7y5vJaBqYs9FpWxxJjUm2VOUXp5toQPk0xNXWwPe1A4H2X0koFbhScWexJjUlfKnKGMDv1qP2veGTHJw9TF+EyUJue866pYTHLmhA+TcnOyHZmr8Wo/+6ktIyZ5mLpYn0XHuWu5EG/q4ovFnsSY1BulXxrORXyYZGrq0jJKPRvC3SqcsdgrFhNF7ZhveQ1eJ+6AAYGY5GDqYsakzpee3BWNSX1cICbNw7RqOw7qMSaAQBwmOZi67pjDjq/cF+GmLj8mjZ6mu6fmWq9RcAYwjz5XI/9yYgMQiMYkU1PXgr175ltpbop2q8wjDEXzniB3WyaY7JcKhpMMMcnB1MWBiahhKgNM9N8GjCgjWTDZT5CdZIhJDqau53pGw8mzaFNXNCb7rX/4UrayYOJfd1dAgWhMCjZ1HUwrXAUrgt0qMZjst40Eq3P6rSHknpVMMZlwWtAPd9OU+H4VPW8ca849QcvMMJlJYupKBOBVzpjsl5zDydp84pR7RSCp1T0eE3+nEbYQF3Q3jdoPS2XGGpMObfb+xnMY0b+fe38bwvp81Bdx241MmPC8wofrUfcPgk1dsZgEvD0iIjsZB/oPevOMMFFZRrqIW1aUXuCgonJmlXFHGv17jaERk37kLQVKb5IVJhKYuhKsHT0LdqvEY7JVmNddJ6Hbn+oyE0ziI2w9avI7n9mu3jgvTMYdFg/CWDAme3lMXQlmXblj4r9tqB4c82tVrNVdACZjluswSnb1lH0umKx7rDOTxrx0mHC9YPRBCIDJTF0MmCzZnDsTRbDVPT0ma0YHzjYJJr18MNE4AknLABM5TF2GrnhK7ot1qzBg4neSBc26xsJvCREwmrA6tZNgspQPEybLHTMmbZlMXbwei4f8MfHPutYJKOHmJAkmc/6jCggvlRMtaTBh6cxlwuSOq3E8yclCrKmLBZNxvAFynKjXFr/StU644jjmxmQsJSYMdh1OTGQxdXEuNu/EulVYMFnGDu7LLO4bYMCkETcu91jv6dpyYkJ9QSJM4j0SzJjcSGXq4o2e/DHZx/UZAVv1ihp4U8hSKCbL2BO5THQJGDDp7eXEJD6WZMLkmatpXH4VVaipiwkTNeZkeJcVFOsJeFv/eqwqFJNefM7ksKp0tMnc6Gq383HAGivVCzNgsiwOE6U3Mq0260nQw6MU0ZjIYurizHtUoW4VJkw60X/kLaO5Zs6xU2GyZOhJrTfsNEf0MLbVInONvupRM3o4zRUTd5a+7fNnJ8yYyGbq4huprvLHRIu+Fh5wO/4wTdQjxAWfz70cdDP81hjbAjbafTerRHrwR9Epf66YaDGXplcmTJTMMNGEmroSYqKFF+EJVjVxdhITfEsvJcE3VvZDTBwTnmvQiE6UC8TEP7loCsZEGlMXH4KaULcKEybzSEw6kd9fJ9gBYwiuZS9+lTpaTfbp4Dymxy4Skwlvn8uMiXSmLi5M7mTARA3lQI1JbJTUmKzn436jnpYSX/xF+J47MQt2RWKy511NlAoTLlMXl5d+IdTUlR6TUUwGOU466+J66IvC7dWfM1/fddy8plBMmpyrJLyYyGPq4kIwbhuez62SHhM1xnizTtpWHkwSvCV6zpzDa3EDV6GYqJlhIpupS3ZMlhEnYxubejQSnkd2TNQkt33Nma+vErfTDUzyMXWJxITP1MWEyT5ibW4SmyGoCZMTRkwaWrLb2pkxGccuuVYaE4lMXaqIkhO5VVJjonEvJ28FjyaNES8n+iKA5rtrVmVdEvNnVxXFRDpTV4kxUWNPkpZwI54jN+mxgrKda50m3zVYxveXwCQfU5dITPhMXakxaXBjMhaPif4yS4YxZNxrJLgGvfiV52pjUk5TV/g4lcStkhqTesxCl9/poWWAiX4Ko+dya62Z7Bps63EJfGUxkc7UJTkmEQvCcZuL84nWEYWJYvkQwwaUiA0ZljcCh1yDEYNnCpjkY+ricdLf1UWautJiMg+7/mvj6WuNNBtQ4cG1DJw+hXHC+EbgEEwaDJvc1cZEHlMXz4Jw+I5MEreKeEz0+zlC02SuoTM6uOYqIyeTRpoR3WeZauxfDSbSmboqg4miKsJmmHHB53/iUYCTftthvQbBh+X7+giYFGbquhNScBJTFxMmk/Bzwfu2LYGYBLzgxGc4WYYMa/rb6Xosh+V/0tf21WEij6lrIWSYSuJWSXu/SZGYBFQ+iQPJ2PfQJmvWXfg+QwJfXUxkM3XxvIGxIQMm4xSY9IRh4t/ToDOHgEdZNEZbHrOKwhSDwCQfU5eYleYkpq6098LzYNJUtRHHe0UYMFnXI/f+fBHkfh41CyZjlgS+6phIY+pqiik3iVsl7ZNV5hnwwY6J32+lRgV5J+rhWkGYNFkS+OpiIpmpi+chwg8FYFIP71TnGfDBgYkWkWL73jihRhavspycLTApztTF80j6fiwmXKYuFkz8U5tOxO/S88GBSVQSP452mTBg0mNMqyqOiSymrhdB+zEJ3CosmPjXg0fhzRTABwcmy4hl+2Z0fMVjsq0zRmBVMZHL1NUUVWxGmPgHsGX4wttemFgw2Yevo21jJkzxmGhsCTwwycfUJeSBEQlNXSyY+BJZJeIqLQvGRA0bA9U9LyYNtgS+8phIYurimcz1owpK4FZhwGQdufPB8RyffDHRYsIrFpMJYwJfXUykMnVxvSyrmT8m0c/bnaRaNk+LyTYck37UjgoLJirzvigwycHUxZPAv9TjMeEydTFg0oiac/kDdZ0nJvPwRTg1pl1xmKzrzPFXcUykMHVxDSbRe/sJ3CrxmIxj3CbNhF4UIZiMwvuytJj0WRP4gKmfUhFM5DF1KTyDSfScKxNM/K+F92Tpo6yGExZMOuFr1WpM0hSDib/dI47lR2AipuNPtMwVt2eZwNQVi0kn7jTEPjo0Q0z8qcnh8HvpUvgxcwIftKq5rBImEpi6uF6UFb3OlcitEodJrx47K2Pdq84Ak36EVUKLuXoxmDR5WhWT7ZcWE1lMXU2unf2dkjMma5VhTPUX0QuxPnXWYjGZRx3dOGYyOOdyfEVHXz96YgpMEk+QElASZXtMauqKCod14LMW1gxL3w3/s6zWo6boN/kG3XR1SCCW4UY0Bkx6HAl80BYLdV9+2TEp2NTFSck+9uEH/G4VPyaNnjbXNQ55sFVApAe9LrehHa7Wdj6yn4TSEInJKGhBZBtxtsbsmAS4Pec+raNypHqfgDL3v0m0LJhIYer6yEnJQz0PTBLkZyEpU8N8rFYjqZXFd2iNydY1ODXiIO7VI9eq5lyhG1NZ8IMpfM0HJgzLH56O726/FzyYJDB1cWKiBGYX2ybr93tpMDEo7WiG1JBTQXnlAzz+zbHzB+t+VOg2ODHhPI0lw6RAU9fHF15KGFaY+d0qnNc3ZDRYsvo8lZSYxGgSs5ZtRGjP4KzTiAzdcZ0TE86XCJYFk6JNXeqCF5LYZa48MAl9SvY4WSALxsQzVq2VpKGrcmOyBCaiTV3KFfdIEr9nktDUxfXY94hnybNy0skQk15ieD2hu65zYxK4oFAVTAowdSlXP/ZJxLQNw+9W4YhFJTL/Zg3JbWaY9JJ1LQGh20uACeuXyoVJIaYu5aP2vE+oZtGYxLwZYT9nm+KMs8JkxN5VxVzcrZIEEx5OgElwyq2qfW2x2ycXW7/Ib+pinVMr8bdbbZlm9OyzriVPaqGGDHUT5kI63AOjN2DHzHVp5cIkU1PXs46G9mOxWOzTi/FxRgncKusew8VVNKa5UvzD3w8PXWTQVmuwQhIeGlu2DqY55lwNDkpV10wdhdJf78uCSQ5uFYHaKZlhogfSuCMstsdRIab0uF9MPWGAWOlFb1qu+3FlNPrLJJO9gBWdedwD8Bu9SezEEJhkmZjUE75+0QxHLawjbPb5HgKx7AeSoqhawodJLEedCPZUjQW9Sb8ZHrfeFwH3UmBi2ANCh5Rmb7RkyZ/kwyRTU5cwXTFP0ZO8V865wHN9e9v1zjYjn5pvExzuWn+RnPOek4ZZTNpbtfR30xnHpriNMH1twkHe1nh7l2v3vmkUMJ5ncr3mI811rMa78DRtMt/LIS5M8nCriBLHck0aTKBXoapi8lDnxYTv9YsQMInBJFNTV/6UJHqvHARMQpWDWyV/SoAJ9Cox4aMk0esXIWASg0mmpq78KUn0XjkImIQqB7dKeml1YAIBk0jtruoJMeF6/SIETGIwydTUlVLPTW5KkrlVIGASJundKndKHZhAwCRywvWxXk+OCb+pCwImEZhIaup6UOrJBLcKJBITmd0qz2q9DkwgYBKhl6t6PSUmMHVBQjGRztSVCpJC3CpP05WIYqbTTVZHGFQ0ddTsTRDU2AwKywYTOd0qKSEpBJOj2r2IkKnVsoqZwKKpo2ZvQq32KNuZe3WY/FDrdSGY5GPqGtSu9f+uarUn/b8nR+mi/L52lNVpDSraOuqgD/vHozPjn1YQEEJhpquVGhN5TF0v/UY9vcS6VZ5aLXIhL1pDf8/aNaKqVjORSRk/17VWVmc2qGjrqIM+6HycGBO1WlBXLxRmulrfue9KgYlUbpWXu2ZdiMRiovd3UxIffgwehxsnCDeDaboz0KoNssLkLKDogRsd6sP+aWC2dHifNcyDqMIGWXUbpcVk0RfEiHhTV602JFHczTa+hU76vUVPA476OuQDN3EpeobrhL/MHZOiTV0LTa2LlGC3Ss0Oi2n4nEpMfGeYwevHvonOntmbEERcNj1DZt0GJyZFu1V2i7urZl20BGNCek9nMLnvtlpDK+qGrWsnvjdOEjO9brVaAyo1XQ31L10MnVjdDC9are69+XlzP9B/50z6NwPrq8afXJBAfhzof78ihV+vSKlGTddBYXvdunclVEMz16DrJdnzcPBoNsFoll3wtGXOdrotetI11Y+z1SXErfRP3Wl4nfSZCm4PXa1xKq+dQq9btdpZa+Ar6GnQNU7v6hVgslg8aFeqUs9Egk1d9ozqye5Fn05qhs42h98NScJr5/y1Wqt1QnW6+pdPWq2j2pHNzuDI+KyXYv2uZo5YdoZzZuF4f2T+vGt3/LrM37bMn1rlDGu2roMyiAtXQnVhl+Ou186eu2ZT9D87Gwy6dv9tJwX0uKFXfdQdXJ/YxF1bVd+H1kmfqeD20NXuNxeuQvVTeNRqPXoLuiCNfswbk0xNXRqlj9STpjKSWLfKhRWFXSt0no5qekc2PbKut3WxumZ4DMzgM/9g453m2HHXtUNMD82p8z0dss2BR4eS2pHe5w+tkHkiy6b6by+e9qszqxxrfNt0gyZrJP09Mf/mxMqvqHqtv7Ao0SP8zALvaOMkBZ6Zmn5gG+fLxvcevVXTddJnKrg9dLXGApte6LX9iawVeE+5UQI5BblgIsXrF2XHxLr49oLX5sTq6u7Nq2RnE9a0zOqxN0dWRA6py0iS0SOzkIHdMZLvXRym4oSSJ3vA6Jofh2QN1h4VVla9JLkIyhYerfqtjn1TC6jXPKYuNSwaRT46BdNNGNiHaRE3tL934h5O6Do9ZyqwPXS1A5sPu132LwNPuTN2VwUTpShMRJm6SK/bcgeLdZWsbMIOQit+7L+z48GbLZtXfkW6YPf37AAgs6OW/UNSOanVHnjMb5LkIjD1t8PoxAw1a37lqdc4JhLtDmnkAJ9ctdrr4lYIW43VO4Mn/xofVSd9poLbQ1e7oc6Sk8EHnXIvw7lgUuDrFzORWLfKvXFlbRT0EHhyXTNrWmD9vx0/5MKT4N/v3QFqBgAhyJrUON8wAoD8akW6WyusyCpClxRqfodszQXu963Mwu+t4CbB6a7XYOGeUOLMr8wDfCTh7mpC1x4PSbBeBCyFU3VSZyqkPXS1njGG0B90yj0MZ4xJ0a9fLAUmU+PC2NPuqdGHPU0H19bUuGX3m2fOVSSd3IaaCD2SADAj78jOPoeu71kB0CVTmIER0dPHQdea5pPCjMBZTYeDlhlBJGKC9/vM71gduz3no+vVWbh3RjynbzYP0Gos3QQyfFiNbekHupneDy5oS5arTvpMhbSHrtZZSrTmrTb9nlNOCEu1eyMhJh+LwkSUqcuI442VVBizZ2PVpXUxuH9ypgXWRMmKnwuq0/VuXJuR5/zK/T0z9M7InMrIZfXFoKNWd/C4OnS6+r9nNXOVdDh1JTzBm5snelX37sm+v96Dn4r0zdZ0y8ngffMp8mXrQE5a1wPKeOyqkz5Twe3xVEsWr+w08JpMcwNOecrdm2SYFPD6xUwl1q2ix7be7bXsIGndHwLDvtxWj0p67HtXp+vdpTc7yCH5lTWpIdmIEQAnJOD1VZ3HQxiQTlf/d+jynR8i5jFkHfvEWcte+erVj7frDENn7gO0C6SaQE6AlbPrBQ6mT5F10mcquD10tc7ylz2MtIIKcvUYm/wwKeT1iyXDRI8as5v0d9zW5bYTXgsQ0sldUBk8CWRzWjFwDy0HsIxYntJJ9mFJukstuNKb9iGb993a4NEeTKy489fr5MyujKrrFEg1gXzZamzYMpOrTvpMBbeHrtYzYJHvBJ3ylBm8jJjcFYaJKFOXPlUmF4V2GVlzBmcZ6ckVD1T6+3ToAleHXnrq/p4dyy07GukB4sRZJjqjlhaOwjN4Mx0gEWZNXwLqJSuwU2cxwDhAu0Aq7SBfthob1pe76qTPVHB76GrJJ3vOReoIOuUpM/iEmGRq6lrkj4lgt4o+sT6k1icbr43FCkJ7dejMigA6/bUp0/dErvcHb9jAvRduF/Nkx1PLHQVOYVPq5ozoDN6olBzsmZ1U++rVtySuXRDoo8uhQfSdIIcv2/vzw5g66TMV3B66WlKh/bekawo65Wn9l7yY5OBWqQImzgivX0p9F1xf5Hk8TAvIchdJOFd7720UVte3sncO9Ut89uTKpFvu/KVrBYXevxqmpdV0SuXSJ8bWt/4D9+4b+ffa41+eHpwkdlgG1Htvhab5o829vc/dcu21uOLzzLVs0DX31PdPj6uwOukzFdweulpjDWNlWH0sLHQ8VmGnPK3/UkJMngvDRJSpq+tyLtnOJLJfsnEmFIdlJ93QdVajevgzw0h1QpzGxKJUc2X+zoVfHZGgrxGrl2uuRb55tPFl8Pfe2wCfHLjJ9MVT78A6tJaJ35FT2yGDpwYp6svEWuYN1kOd9JkKaQ9drWFKMa1bK8KZNfkLOOUpM/ikmGRq6iq9W+W+5d6NHhr2VDNAH82fryzn7kXLnn3f69bXwZlnZn5m2IOdnte06V5YN3GR7+nFmBd+aP9rWGUvLKvwoOVMMDZG6deWwdf+Q/vfE980qEWO6JEcP12v+Y/uBZ4aptuLwwHaDTrzGCrdXzYK1W263eEqrE76TIW0h6rW+IZhD3YKmF7Yf0ed8u7e/W9OmMDUlY2o9Ddl18ekYaqUdh+4i1/ATeo5SUZMSm/q4tejxx58lnWFm6MjwSReZHdffmkxgalLbNCeUOn0Ra2bdY0DkXcUWqPT0QqYOIKpS2y4GmnD4xlxFO79eyiZaCX4pvHVhXMDGTDJCZPSm7rYNbXXc1puSjY10V29P6wFV6C3oMJjSWJMYOoSFa/G2o3n3vTNdFqyKFpdT/d7YOISTF3Q65OMmJTf1AUBE5i6IGASI5i6IGAiAyblN3VBwASmLgiYxAimLgiYSIHJKzR1QZXEBKYuCJhECKYuCJjIgMkrMnVBlcYEpi4ImEQIpi4ImMiACUxdUDUwgakLAiYRgqkLAiYyYAJTF1QRTGDqgoBJuGDqgoCJFJjA1AVVAxOYuiBgEiGYuiBgIgMmMHVB1cAEpi4ImEQIpi4ImMiACUxdUDUwgakLAiYRgqkLAiYyYAJTF1QRTGDqgoBJuGDqgoCJFJjA1AVVAxOYuiBgEiGYuiBgIgMmMHVB1cAEpi4ImEQIpi4ImMiACUxdUDUwgakLAiYRgqkLAiYyYAJTF1QRTGDqgoBJuGDqgoCJFJjA1AVVAxOYuiBgEiGYuiBgIgMmMHVB1cAEpi4ImEQIpi4ImMiACUxdUDUwgakLAiYRgqkLAiYyYAJTF1QRTGDqgoBJuGDqgoBJoZjsFosfmtZXC8MEpi5IKCbCTF0EDbVZL1Jwq0AiMRHhVpEEDWACyYaJhGjA1AVljAmnqUt6wa0CCcUkkVsFmEDApDKYwNQFicSE09QlveBWgYRiksytAkwgYFIVTGDqgoRiwmnqkl5wq0AiMUnmVgEmEDApPSX/w6QLygATTlOX7LJ24d/8QgoPCcEkmVtFcv1hNePUbuIpMIGASQglpFHwdEGCMKmMqevP93/YM643x/ac67v18RtCBEqMSRXcKu/f/+/du3dv3/72xi17MNlfWh//Q4hArw6TYDRcsg04ZM51igiB0mJSDlNXLBpuSshzLex86wsiBEqOiexuFR40XGoTSnbHmHNBlcQkIRoHHd867fvrDZaDIVGYFG7qSo2Ga7719fAgMXvtDnfCQ6kwKdKtIhANY8Bot29vb2cz98P2fh5jMIFKiEk2aIQMFoSSNz8RH5AATDI1deWKRhAl2IGH0mGSlVulKDRc+n7s2UKBICGYfLU+/VlaNA769Zez7rVDdEBCMLmkpmDvSoqGC5LLw+owEhMoNSb03RhvWIYTSdE45CRf229ACSQSkw/U/uJlGCeyo6EPILPZ99vby3ab3mkEJZAATG6oFeEZCa/f35cKjdM40woEpcFkRt1xsr98I1KFoOESVoIhMZjsrWXTY/vT7rTsaBz0AX5HSBQmn6yY+k7y3+NSo3HQJ/i4IHGYzDz3Lf08LS8ah4P7GyMJJBIT+8kjzk2x+93ncqJhTR7b7U83MyTukGhMvvn8gb8uj0uGxoebm79nMyz+QplhQoaTU8qC/i/QgICJPzs53D8ONCBg4tMHkZwADaiamDibJac/gQYETEJ02Cy53QENCJgE65sTr6ffd0ADAiYxnLw5vvx3BzQgYBLECWVSOW9/BhoQMPHnJ0KQABpQpTHZ774ADQiYxGp2DjQgYBKfoZwDDQiYxKcoX06BBgRM4kn59sV88ALQgIAJBAETCIKACQQBEwgCJhAETCAImEAQMIEgYAJBr1T/D8UMqjNVE8zoAAAAAElFTkSuQmCC';

// ── Shared data loader ────────────────────────────────────────
async function loadInvoiceData(token: string) {
  const result = await query(
    `SELECT r.*, c.first_name, c.last_name, c.email, c.phone, c.btw_number
     FROM reservations r
     JOIN customers c ON c.id = r.customer_id
     WHERE r.cancellation_token = $1`,
    [token]
  );
  if (result.rows.length === 0) return null;
  const r = result.rows[0];

  const vehiclesResult = await query(
    `SELECT v.license_plate, v.ev_service_id, v.ev_kwh, v.ev_price
     FROM vehicles v WHERE v.reservation_id = $1 ORDER BY sort_order`,
    [r.id]
  );

  return { r, vehicles: vehiclesResult.rows };
}

// ── HTML invoice (single source of truth, used by both admin + customer) ─────
export async function generateInvoiceHtml(token: string): Promise<string | null> {
  const data = await loadInvoiceData(token);
  if (!data) return null;
  const { r, vehicles } = data;

  const plates = vehicles.map((v: any) => v.license_plate);
  const nights = Math.round(
    (new Date(toIsoDate(r.departure_date) + 'T12:00:00').getTime() -
     new Date(toIsoDate(r.arrival_date) + 'T12:00:00').getTime()) / 86400000
  );
  const days = nights + 1;
  // Factuurdatum: instelbaar veld, anders reserveringsdatum (created_at)
  const invoiceDateRaw = r.invoice_date
    ? toIsoDate(r.invoice_date)
    : toIsoDate(r.created_at);
  const invoiceDate = invoiceDateRaw
    ? new Date(invoiceDateRaw + 'T12:00:00').toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });

  // Parse extra items (manual invoice lines)
  const extraItems: Array<{ description: string; quantity: number; unit_price: number }> =
    Array.isArray(r.invoice_extra_items) ? r.invoice_extra_items
    : (typeof r.invoice_extra_items === 'string' ? JSON.parse(r.invoice_extra_items || '[]') : []);
  const extraTotal = extraItems.reduce((sum: number, it: any) =>
    sum + Math.round(parseFloat(String(it.unit_price || '0')) * (parseInt(String(it.quantity)) || 1) * 100) / 100, 0);

  // Annuleringskosten: bij een datumwijziging die de prijs verlaagde, is volgens
  // het annuleringsbeleid vaak maar een deel terugbetaald. Het ingehouden deel
  // (verlaging − restitutie) hoort op de factuur, zodat het totaal gelijk is aan
  // het werkelijk betaalde bedrag (bv. €120 − €3 restitutie = €117, niet €110).
  const refundAmount = parseFloat(r.refund_amount || '0');
  let cancellationFee = 0;
  if (refundAmount > 0) {
    const modRes = await query(
      `SELECT COALESCE(SUM(CASE WHEN price_difference < 0 THEN -price_difference ELSE 0 END), 0) AS reductions
       FROM reservation_modifications
       WHERE reservation_id = $1 AND status IN ('completed', 'accepted')`,
      [r.id]
    );
    const reductions = parseFloat(modRes.rows[0]?.reductions || '0');
    cancellationFee = Math.max(0, Math.round((reductions - refundAmount) * 100) / 100);
  }

  const totalIncl = parseFloat(r.total_price || 0) + extraTotal + cancellationFee;
  const totalExcl = Math.round((totalIncl / 1.21) * 100) / 100;
  const btwBedrag = Math.round((totalIncl - totalExcl) * 100) / 100;

  const esc = (s: string) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  // Build optional service rows
  let serviceRows = '';
  const seasonSurcharge = parseFloat(r.season_surcharge_amount || 0);
  if (seasonSurcharge > 0) {
    serviceRows += `<tr><td>Seizoenstoeslag</td><td class="num">1×</td><td class="num">${fmtMoney(r.season_surcharge_amount)}</td></tr>`;
  }
  let evSum = 0;
  for (const v of vehicles) {
    if (v.ev_kwh || v.ev_service_id) {
      const evPrice = parseFloat(v.ev_price || 0);
      evSum += evPrice;
      serviceRows += `<tr><td>Auto laden${v.license_plate ? ` — ${esc(v.license_plate)}` : ''}${v.ev_kwh ? ` (${v.ev_kwh} kWh)` : ''}</td><td class="num">1×</td><td class="num">${fmtMoney(evPrice)}</td></tr>`;
    }
  }
  const onSiteSurcharge = parseFloat(r.on_site_surcharge || 0);
  if (onSiteSurcharge > 0) {
    serviceRows += `<tr><td>Toeslag ter plekke</td><td class="num">1×</td><td class="num">${fmtMoney(r.on_site_surcharge)}</td></tr>`;
  }
  const paymentSurcharge = parseFloat(r.payment_surcharge || 0);
  if (paymentSurcharge > 0) {
    serviceRows += `<tr><td>Toeslag PayPal</td><td class="num">1×</td><td class="num">${fmtMoney(r.payment_surcharge)}</td></tr>`;
  }
  const overbookingSurcharge = parseFloat(r.overbooking_surcharge || 0);
  if (overbookingSurcharge > 0) {
    serviceRows += `<tr><td>Overboekingstoeslag</td><td class="num">1×</td><td class="num">${fmtMoney(r.overbooking_surcharge)}</td></tr>`;
  }
  if (cancellationFee > 0) {
    serviceRows += `<tr><td>Annuleringskosten (niet-restitueerbaar deel datumwijziging)</td><td class="num">1×</td><td class="num">${fmtMoney(cancellationFee)}</td></tr>`;
  }

  // Parkeerkosten = totaal − seizoenstoeslag − laden − toeslagen, zodat de
  // factuurregels altijd optellen tot het totaalbedrag (ook na een wijziging).
  let parkingPrice = Math.round((parseFloat(r.total_price || 0) - seasonSurcharge - evSum - onSiteSurcharge - paymentSurcharge - overbookingSurcharge) * 100) / 100;
  if (parkingPrice <= 0 && parseFloat(r.base_price || 0) > 0) parkingPrice = parseFloat(r.base_price); // veiligheidsnet
  // Manual extra invoice lines
  for (const it of extraItems) {
    const qty = parseInt(String(it.quantity)) || 1;
    const lineTotal = Math.round(parseFloat(String(it.unit_price || '0')) * qty * 100) / 100;
    serviceRows += `<tr><td>${esc(it.description)}</td><td class="num">${qty}×</td><td class="num">${fmtMoney(lineTotal)}</td></tr>`;
  }

  const destLabel = r.ferry_outbound_destination
    ? ` — ${r.ferry_outbound_destination.charAt(0).toUpperCase() + r.ferry_outbound_destination.slice(1)}`
    : '';

  const paidBadge = r.payment_status === 'paid'
    ? '<span class="badge badge-paid">Betaald</span>'
    : r.payment_status === 'on_site'
    ? '<span class="badge badge-onsite">Ter plekke betalen</span>'
    : r.payment_status === 'pending'
    ? '<span class="badge badge-pending">Te betalen</span>'
    : `<span class="badge badge-pending">${esc(r.payment_status)}</span>`;

  const payMethodLabel = r.payment_method === 'ideal' ? ' via iDEAL'
    : r.payment_method === 'card' ? ' via creditcard'
    : r.payment_method === 'contant' ? ' — contant'
    : r.payment_method === 'pin' ? ' — pin'
    : r.payment_method === 'tikkie' ? ' via Tikkie'
    : r.payment_method === 'sepa' ? ' via SEPA-overschrijving'
    : r.payment_method ? ` via ${esc(r.payment_method)}` : '';

  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Factuur ${esc(r.reference)} — Autostalling De Bazuin</title>
<style>
  @page { size: A4; margin: 20mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11pt; color: #000; background: white; }
  @media screen { body { background: #eee; padding: 20mm; } .page { background: white; padding: 20mm; max-width: 170mm; margin: 0 auto; box-shadow: 0 2px 16px rgba(0,0,0,0.15); } }
  @media print { .no-print { display: none !important; } }
  h1 { font-size: 22pt; font-weight: 900; color: #0a2240; margin-bottom: 2mm; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10mm; }
  .company { font-size: 9pt; color: #555; line-height: 1.6; }
  .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 8mm; font-size: 10pt; }
  .meta-table td { padding: 2mm 0; vertical-align: top; }
  .meta-table td:first-child { font-weight: 700; width: 50mm; color: #555; }
  .items-table { width: 100%; border-collapse: collapse; margin-bottom: 8mm; font-size: 10pt; }
  .items-table th { background: #0a2240; color: white; padding: 3mm 4mm; text-align: left; font-size: 9pt; font-weight: 700; }
  .items-table td { padding: 3mm 4mm; border-bottom: 0.3mm solid #ddd; }
  .items-table tr:last-child td { border-bottom: none; }
  .items-table .num { text-align: right; }
  .total-row { font-weight: 900; font-size: 12pt; }
  .footer { margin-top: 12mm; font-size: 8.5pt; color: #777; border-top: 0.3mm solid #ddd; padding-top: 4mm; line-height: 1.6; }
  .badge { display: inline-block; padding: 1mm 3mm; border-radius: 3px; font-size: 9pt; font-weight: 700; }
  .badge-paid { background: #e8f5eb; color: #2a7a3a; }
  .badge-pending { background: #fff0cc; color: #8a5f00; }
  .badge-onsite { background: #e8f0ff; color: #1a3a8a; }
  .dl-bar { display: flex; align-items: center; gap: 12px; margin-bottom: 14px; padding: 10px 14px; background: #f4f7fb; border-radius: 8px; border: 1px solid #dde4ef; }
  .dl-btn { background: #0a2240; color: white; border: none; border-radius: 6px; padding: 9px 20px; cursor: pointer; font-size: 13px; font-weight: 700; letter-spacing: 0.2px; text-decoration: none; display: inline-block; }
  .dl-btn:hover { background: #1a3a60; }
  .logo { height: 56px; width: auto; }
</style>
</head>
<body>
<div class="page">
  <div class="no-print dl-bar">
    <a href="/api/v1/invoice/${token}" download="Factuur-${esc(r.reference)}.pdf" class="dl-btn">📥 Download PDF</a>
  </div>

  <div class="header">
    <div>
      <img src="${LOGO_B64}" class="logo" alt="Autostalling De Bazuin" style="margin-bottom:4mm">
      <h1>Factuur</h1>
      <div style="font-size:12px;color:#7090b0;margin-top:1px">${esc(r.reference)}</div>
    </div>
    <div class="company" style="text-align:right">
      <strong style="font-size:11pt;color:#0a2240">Autostalling De Bazuin</strong><br>
      Zeilmakersstraat 2<br>
      8861SE Harlingen<br>
      info@parkeren-harlingen.nl
    </div>
  </div>

  <table class="meta-table">
    <tbody>
      ${r.guest_company ? `<tr><td>Bedrijf</td><td><strong>${esc(r.guest_company)}</strong></td></tr>` : ''}
      <tr><td>Klant</td><td><strong>${esc(r.first_name)} ${esc(r.last_name)}</strong></td></tr>
      ${(r.guest_address || r.guest_postal_code || r.guest_city) ? `<tr><td>Adres</td><td>${[esc(r.guest_address || ''), esc(`${r.guest_postal_code || ''} ${r.guest_city || ''}`.trim())].filter(Boolean).join('<br>')}</td></tr>` : ''}
      ${(r.guest_btw_number || r.btw_number) ? `<tr><td>BTW-nummer</td><td>${esc(r.guest_btw_number || r.btw_number)}</td></tr>` : ''}
      <tr><td>E-mail</td><td>${esc(r.email)}</td></tr>
      ${r.phone ? `<tr><td>Telefoon</td><td>${esc(r.phone)}</td></tr>` : ''}
      <tr><td>Kenteken(s)</td><td>${plates.length ? plates.map(esc).join(', ') : '—'}</td></tr>
      <tr><td style="padding-top:4mm">Factuurdatum</td><td style="padding-top:4mm">${invoiceDate}</td></tr>
      <tr><td>Betalingsstatus</td><td>${paidBadge}<span style="font-size:9px;color:#777;margin-left:6px">${payMethodLabel}</span></td></tr>
    </tbody>
  </table>

  <table class="items-table">
    <thead>
      <tr>
        <th>Omschrijving</th>
        <th class="num">Aantal</th>
        <th class="num">Bedrag</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>
          ${days} dag${days !== 1 ? 'en' : ''} parkeren${esc(destLabel)}<br>
          <span style="font-size:9px;color:#777">${fmtDateShort(r.arrival_date)} – ${fmtDateShort(r.departure_date)}</span>
        </td>
        <td class="num">${vehicles.length > 1 ? `${vehicles.length}×` : '1×'}</td>
        <td class="num">${fmtMoney(parkingPrice)}</td>
      </tr>
      ${serviceRows}
      <tr style="border-top:0.3mm solid #ddd">
        <td colspan="2" style="padding-top:3mm;font-size:9px;color:#777">Subtotaal excl. BTW</td>
        <td class="num" style="padding-top:3mm;font-size:9px;color:#777">${fmtMoney(totalExcl)}</td>
      </tr>
      <tr>
        <td colspan="2" style="font-size:9px;color:#777">BTW 21%</td>
        <td class="num" style="font-size:9px;color:#777">${fmtMoney(btwBedrag)}</td>
      </tr>
      <tr class="total-row" style="border-top:0.5mm solid #0a2240">
        <td colspan="2" style="padding-top:4mm">Totaal incl. BTW</td>
        <td class="num" style="padding-top:4mm">${fmtMoney(totalIncl)}</td>
      </tr>
    </tbody>
  </table>

  ${r.notes ? `<div style="font-size:9.5px;color:#555;margin-bottom:6px"><strong>Opmerking:</strong> ${esc(r.notes)}</div>` : ''}

  <div class="footer">
    Autostalling De Bazuin · Zeilmakersstraat 2, 8861SE Harlingen · KVK: 51258692 · BTW: NL863463319B01<br>
    IBAN: NL81ABNA0108087948 · info@parkeren-harlingen.nl
  </div>
</div>
</body>
</html>`;
}

// ── Credit note HTML (for cancelled reservations with refund) ────────────────
export async function generateCreditNoteHtml(token: string): Promise<string | null> {
  const result = await query(
    `SELECT r.*, c.first_name, c.last_name, c.email, c.phone
     FROM reservations r
     JOIN customers c ON c.id = r.customer_id
     WHERE r.cancellation_token = $1`,
    [token]
  );
  if (result.rows.length === 0) return null;
  const r = result.rows[0];

  // Alleen zinvol als er een terugbetaling is
  const refundAmount = parseFloat(r.refund_amount || 0);

  const esc = (s: string) => String(s || '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

  const creditDate = r.cancelled_at
    ? new Date(r.cancelled_at).toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
    : new Date().toLocaleDateString('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' });

  const originalExcl = Math.round((parseFloat(r.total_price || 0) / 1.21) * 100) / 100;
  const originalBtw  = Math.round((parseFloat(r.total_price || 0) - originalExcl) * 100) / 100;
  const refundExcl   = Math.round((refundAmount / 1.21) * 100) / 100;
  const refundBtw    = Math.round((refundAmount - refundExcl) * 100) / 100;

  return `<!DOCTYPE html>
<html lang="nl">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Creditnota ${esc(r.reference)} — Autostalling De Bazuin</title>
<style>
  @page { size: A4; margin: 20mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: Arial, sans-serif; font-size: 11pt; color: #000; background: white; }
  @media screen { body { background: #eee; padding: 20mm; } .page { background: white; padding: 20mm; max-width: 170mm; margin: 0 auto; box-shadow: 0 2px 16px rgba(0,0,0,0.15); } }
  @media print { .no-print { display: none !important; } }
  h1 { font-size: 22pt; font-weight: 900; color: #8a1515; margin-bottom: 2mm; }
  .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 10mm; }
  .company { font-size: 9pt; color: #555; line-height: 1.6; }
  .meta-table { width: 100%; border-collapse: collapse; margin-bottom: 8mm; font-size: 10pt; }
  .meta-table td { padding: 2mm 0; vertical-align: top; }
  .meta-table td:first-child { font-weight: 700; width: 50mm; color: #555; }
  .items-table { width: 100%; border-collapse: collapse; margin-bottom: 8mm; font-size: 10pt; }
  .items-table th { background: #8a1515; color: white; padding: 3mm 4mm; text-align: left; font-size: 9pt; font-weight: 700; }
  .items-table td { padding: 3mm 4mm; border-bottom: 0.3mm solid #ddd; }
  .items-table tr:last-child td { border-bottom: none; }
  .items-table .num { text-align: right; }
  .total-row { font-weight: 900; font-size: 12pt; }
  .footer { margin-top: 12mm; font-size: 8.5pt; color: #777; border-top: 0.3mm solid #ddd; padding-top: 4mm; line-height: 1.6; }
  .badge { display: inline-block; padding: 1mm 3mm; border-radius: 3px; font-size: 9pt; font-weight: 700; }
  .badge-refund { background: #fef2f2; color: #8a1515; }
  .notice { background: #fef2f2; border: 0.5mm solid #f0b0b0; border-radius: 3px; padding: 3mm 4mm; font-size: 9.5pt; color: #8a1515; margin-bottom: 6mm; }
  .print-btn { background: #8a1515; color: white; border: none; border-radius: 4px; padding: 6px 16px; cursor: pointer; font-size: 12px; margin-bottom: 12px; }
</style>
</head>
<body>
<div class="page">
  <div class="no-print print-bar">
    <button class="print-btn" onclick="window.print()">🖨 Afdrukken / Opslaan als PDF</button>
    <span class="print-hint">Of gebruik <strong>Ctrl+P</strong> (Windows) / <strong>&#8984;+P</strong> (Mac) &mdash; kies dan &ldquo;Opslaan als PDF&rdquo; als printer</span>
  </div>

  <div class="header">
    <div>
      <h1>Creditnota</h1>
      <div style="font-size:12px;color:#b06060;margin-top:1px">bij factuur ${esc(r.reference)}</div>
    </div>
    <div class="company" style="text-align:right">
      <strong style="font-size:11pt;color:#0a2240">Autostalling De Bazuin</strong><br>
      Zeilmakersstraat 2<br>
      8861SE Harlingen<br>
      info@parkeren-harlingen.nl
    </div>
  </div>

  <div class="notice">
    Deze creditnota is opgesteld naar aanleiding van de annulering van reservering <strong>${esc(r.reference)}</strong>.
    Het vermelde bedrag wordt aan u terugbetaald.
  </div>

  <table class="meta-table">
    <tbody>
      ${r.guest_company ? `<tr><td>Bedrijf</td><td><strong>${esc(r.guest_company)}</strong></td></tr>` : ''}
      <tr><td>Klant</td><td><strong>${esc(r.first_name)} ${esc(r.last_name)}</strong></td></tr>
      ${(r.guest_address || r.guest_postal_code || r.guest_city) ? `<tr><td>Adres</td><td>${[esc(r.guest_address || ''), esc(`${r.guest_postal_code || ''} ${r.guest_city || ''}`.trim())].filter(Boolean).join('<br>')}</td></tr>` : ''}
      ${(r.guest_btw_number || r.btw_number) ? `<tr><td>BTW-nummer</td><td>${esc(r.guest_btw_number || r.btw_number)}</td></tr>` : ''}
      <tr><td>E-mail</td><td>${esc(r.email)}</td></tr>
      <tr><td style="padding-top:4mm">Creditnotadatum</td><td style="padding-top:4mm">${creditDate}</td></tr>
      <tr><td>Originele reservering</td><td>${esc(r.reference)} — ${fmtDateShort(r.arrival_date)} t/m ${fmtDateShort(r.departure_date)}</td></tr>
      <tr><td>Betalingsstatus</td><td><span class="badge badge-refund">Terugbetaald</span></td></tr>
    </tbody>
  </table>

  <table class="items-table">
    <thead>
      <tr>
        <th>Omschrijving</th>
        <th class="num">Origineel</th>
        <th class="num">Creditbedrag</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Annulering parkeerreservering ${esc(r.reference)}</td>
        <td class="num">${fmtMoney(r.total_price)}</td>
        <td class="num" style="color:#8a1515;font-weight:700">- ${fmtMoney(refundAmount)}</td>
      </tr>
      <tr style="border-top:0.3mm solid #ddd">
        <td colspan="2" style="padding-top:3mm;font-size:9px;color:#777">Subtotaal excl. BTW (21%)</td>
        <td class="num" style="padding-top:3mm;font-size:9px;color:#777">- ${fmtMoney(refundExcl)}</td>
      </tr>
      <tr>
        <td colspan="2" style="font-size:9px;color:#777">BTW 21%</td>
        <td class="num" style="font-size:9px;color:#777">- ${fmtMoney(refundBtw)}</td>
      </tr>
      <tr class="total-row" style="border-top:0.5mm solid #8a1515">
        <td colspan="2" style="padding-top:4mm">Totaal terugbetaald incl. BTW</td>
        <td class="num" style="padding-top:4mm;color:#8a1515">- ${fmtMoney(refundAmount)}</td>
      </tr>
    </tbody>
  </table>

  <div class="footer">
    Autostalling De Bazuin · Zeilmakersstraat 2, 8861SE Harlingen · KVK: 51258692 · BTW: NL863463319B01<br>
    IBAN: NL81ABNA0108087948 · info@parkeren-harlingen.nl
  </div>
</div>
</body>
</html>`;
}

// ── PDF invoice via puppeteer (identieke layout als HTML-preview) ─
export async function generateInvoicePdf(token: string): Promise<{ pdf: Buffer; filename: string } | null> {
  // Genereer de volledige HTML (zelfde als preview)
  const html = await generateInvoiceHtml(token);
  if (!html) return null;

  // Bestandsnaam ophalen
  const refRes = await query('SELECT reference FROM reservations WHERE cancellation_token = $1', [token]);
  const reference = refRes.rows[0]?.reference || token;

  // Downloadbalk verbergen in PDF via extra CSS (no-print klasse doet dit al bij afdrukken,
  // maar puppeteer gebruikt de screenversie — we forceren de printmodus)
  const pdfHtml = html.replace(
    '<style>',
    '<style>.no-print{display:none!important}'
  );

  // Zoek Chromium op in bekende locaties (snap of apt-installatie)
  const chromiumPath = (() => {
    const fs = require('fs');
    const candidates = ['/usr/bin/chromium-browser', '/snap/bin/chromium', '/usr/bin/chromium', '/usr/bin/google-chrome'];
    for (const p of candidates) {
      try { if (fs.existsSync(p)) return p; } catch {}
    }
    return '/usr/bin/chromium-browser';
  })();

  const browser = await puppeteer.launch({
    executablePath: chromiumPath,
    args: ['--no-sandbox', '--disable-setuid-sandbox', '--disable-dev-shm-usage', '--disable-gpu'],
    headless: true,
  });

  try {
    const page = await browser.newPage();
    await page.setContent(pdfHtml, { waitUntil: 'networkidle0' });
    const pdf = await page.pdf({
      format: 'A4',
      printBackground: true,
      margin: { top: '0mm', right: '0mm', bottom: '0mm', left: '0mm' },
    });
    return { pdf: Buffer.from(pdf), filename: `Factuur-${reference}.pdf` };
  } finally {
    await browser.close();
  }
}
